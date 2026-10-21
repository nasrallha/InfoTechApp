import "server-only";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/transaction";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { dayToDateTime, today } from "@/lib/dates";
import {
  applyMovements,
  isNegativeStockAllowed,
  reverseMovements,
  unitsOf,
  unitsSelect,
} from "./stock.service";

// ============================================================
// التحويلات المخزنية (خطوتين) والجرد
// ============================================================

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };
const n = (v) => (v == null ? 0 : Number(v));
const round = (v, d) =>
  Math.round((Number(v) + Number.EPSILON) * 10 ** d) / 10 ** d;

export const TR_PREFIX = "TR";
export const IC_PREFIX = "IC";

async function nextNumber(tx, key) {
  const seq = await tx.documentSequence.upsert({
    where: { key },
    create: { key, last: 1 },
    update: { last: { increment: 1 } },
    select: { last: true },
  });
  return seq.last;
}

// ------------------------------------------------------------
// المستودعات المسموحة للمستخدم
// - "عرض كل الفروع": كل المستودعات (null = بدون قيد)
// - غير ذلك: مستودع فرعه فقط
// ------------------------------------------------------------
export async function userWarehouseIds(user) {
  if (can(user, "allBranches.view")) return null;
  const branch = await prisma.branch.findUnique({
    where: { id: user.branch.id },
    select: { warehouseId: true },
  });
  if (branch?.warehouseId) return [branch.warehouseId];
  const main = await prisma.warehouse.findFirst({
    where: { isMain: true },
    select: { id: true },
  });
  return main ? [main.id] : [];
}

const allowed = (ids, warehouseId) => ids === null || ids.includes(warehouseId);

// الأصناف والوحدات: نتحقق منها ونرجع معامل التحويل والتكلفة
async function resolveItems(items) {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      code: true,
      arName: true,
      enName: true,
      cost: true,
      baseUnitId: true,
      productUnits: { select: { unitId: true, conversionFactor: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return items.map((it, i) => {
    const p = byId.get(it.productId);
    if (!p) {
      throw new AppError("ProductNotFound", null, {
        [`items.${i}.productId`]: "ProductNotFound",
      });
    }
    let factor = 1;
    if (it.unitId && it.unitId !== p.baseUnitId) {
      const pu = p.productUnits.find((u) => u.unitId === it.unitId);
      if (!pu) throw new AppError("InvalidUnit");
      factor = n(pu.conversionFactor);
    }
    return { ...it, product: p, unitId: it.unitId ?? p.baseUnitId, factor };
  });
}

// ============================================================
// التحويلات
// ============================================================

// 1) إرسال: البضاعة تخرج من المستودع المُرسِل وتصبح "في الطريق"
export async function createTransfer(data, user) {
  if (data.fromWarehouseId === data.toWarehouseId) {
    throw new AppError("SameWarehouse", null, {
      toWarehouseId: "SameWarehouse",
    });
  }
  const ids = await userWarehouseIds(user);
  if (!allowed(ids, data.fromWarehouseId)) throw new AppError("Forbidden");

  const warehouses = await prisma.warehouse.findMany({
    where: {
      id: { in: [data.fromWarehouseId, data.toWarehouseId] },
      isActive: true,
    },
    select: { id: true },
  });
  if (warehouses.length !== 2) throw new AppError("WarehouseNotFound");

  const items = await resolveItems(data.items);
  const allowNegative = await isNegativeStockAllowed();
  const now = today();
  const day = can(user, "transfers.changeDate") ? (data.date ?? now) : now;
  if (day > now) throw new AppError("FutureDate", null, { date: "FutureDate" });
  const date = dayToDateTime(day);

  return runTx(async (tx) => {
    const number = await nextNumber(tx, "transfer");
    const created = await tx.stockTransfer.create({
      data: {
        number,
        status: "sent",
        fromWarehouseId: data.fromWarehouseId,
        toWarehouseId: data.toWarehouseId,
        date,
        notes: data.notes,
        createdById: user.id,
        items: {
          create: items.map((it) => ({
            productId: it.product.id,
            code: it.product.code,
            arName: it.product.arName,
            enName: it.product.enName,
            unitId: it.unitId,
            factor: it.factor,
            qty: it.qty,
            baseQty: round(it.qty * it.factor, 4),
            cost: n(it.product.cost),
          })),
        },
      },
      select: { id: true, number: true },
    });
    await applyMovements(
      tx,
      items.map((it) => ({
        productId: it.product.id,
        warehouseId: data.fromWarehouseId,
        qty: -round(it.qty * it.factor, 4),
        cost: n(it.product.cost),
        type: "transfer_out",
        refType: "transfer",
        refId: created.id,
        refNo: `${TR_PREFIX}-${number}`,
        date,
      })),
      { allowNegative },
    );
    return created;
  }, TX_OPTIONS);
}

// 2) استلام: الكمية المستلمة فعلاً تدخل المستودع المستلِم
//    (لو أقل من المرسل، الفرق يظهر في التحويل كعجز)
export async function receiveTransfer({ id, items }, user) {
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      toWarehouseId: true,
      items: {
        select: {
          id: true,
          productId: true,
          qty: true,
          factor: true,
          cost: true,
        },
      },
    },
  });
  if (!transfer) throw new AppError("TransferNotFound");
  if (transfer.status !== "sent") throw new AppError("TransferNotPending");
  const ids = await userWarehouseIds(user);
  if (!allowed(ids, transfer.toWarehouseId)) throw new AppError("Forbidden");

  // الكمية المستلمة لكل سطر (افتراضياً = المرسل)
  const received = new Map((items ?? []).map((i) => [i.itemId, i.receivedQty]));
  const lines = transfer.items.map((it) => {
    const qty = received.has(it.id) ? received.get(it.id) : n(it.qty);
    if (qty < 0 || qty > n(it.qty) + 1e-9) {
      throw new AppError("ReceivedQtyInvalid");
    }
    return { ...it, receivedQty: qty };
  });
  const date = new Date();

  return runTx(async (tx) => {
    // نتأكد إنه لسه "في الطريق" (لو حد استلمه أو ألغاه في نفس اللحظة)
    const { count } = await tx.stockTransfer.updateMany({
      where: { id, status: "sent" },
      data: { status: "received", receivedAt: date, receivedById: user.id },
    });
    if (!count) throw new AppError("TransferNotPending");

    for (const l of lines) {
      await tx.stockTransferItem.update({
        where: { id: l.id },
        data: { receivedQty: l.receivedQty },
      });
    }
    await applyMovements(
      tx,
      lines.map((l) => ({
        productId: l.productId,
        warehouseId: transfer.toWarehouseId,
        qty: round(l.receivedQty * n(l.factor), 4),
        cost: n(l.cost),
        type: "transfer_in",
        refType: "transfer",
        refId: id,
        refNo: `${TR_PREFIX}-${transfer.number}`,
        date,
      })),
      { allowNegative: true },
    );
    return { id, number: transfer.number };
  }, TX_OPTIONS);
}

// إلغاء تحويل لم يُستلم: البضاعة ترجع للمستودع المُرسِل
export async function cancelTransfer(id, user) {
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    select: { id: true, status: true, fromWarehouseId: true },
  });
  if (!transfer) throw new AppError("TransferNotFound");
  if (transfer.status !== "sent") throw new AppError("TransferNotPending");
  const ids = await userWarehouseIds(user);
  if (!allowed(ids, transfer.fromWarehouseId)) throw new AppError("Forbidden");

  return runTx(async (tx) => {
    const { count } = await tx.stockTransfer.updateMany({
      where: { id, status: "sent" },
      data: { status: "cancelled" },
    });
    if (!count) throw new AppError("TransferNotPending");
    await reverseMovements(tx, "transfer", id, {
      allowNegative: true,
      types: ["transfer_out"],
    });
    return { id };
  }, TX_OPTIONS);
}

const warehouseSelect = { select: { id: true, arName: true, enName: true } };
const userSelect = { select: { arFullname: true, enFullname: true } };

// قائمة التحويلات: المستخدم يرى ما خرج من مستودعه أو دخل إليه
export async function listTransfers({
  user,
  status,
  q = "",
  page = 1,
  pageSize = 20,
}) {
  const ids = await userWarehouseIds(user);
  const number = /^\D*(\d+)$/.exec(q.trim())?.[1];
  const where = {
    ...(ids === null
      ? {}
      : {
          OR: [
            { fromWarehouseId: { in: ids } },
            { toWarehouseId: { in: ids } },
          ],
        }),
    ...(status ? { status } : {}),
    ...(number ? { number: Number(number) } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.stockTransfer.count({ where }),
    prisma.stockTransfer.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        status: true,
        date: true,
        receivedAt: true,
        fromWarehouse: warehouseSelect,
        toWarehouse: warehouseSelect,
        _count: { select: { items: true } },
      },
    }),
  ]);
  return { total, page, pageSize, rows };
}

export async function getTransfer(id, user) {
  const ids = await userWarehouseIds(user);
  const t = await prisma.stockTransfer.findFirst({
    where: {
      id,
      ...(ids === null
        ? {}
        : {
            OR: [
              { fromWarehouseId: { in: ids } },
              { toWarehouseId: { in: ids } },
            ],
          }),
    },
    select: {
      id: true,
      number: true,
      status: true,
      date: true,
      receivedAt: true,
      notes: true,
      fromWarehouseId: true,
      toWarehouseId: true,
      fromWarehouse: warehouseSelect,
      toWarehouse: warehouseSelect,
      createdBy: userSelect,
      receivedBy: userSelect,
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          productId: true,
          code: true,
          arName: true,
          enName: true,
          unit: warehouseSelect,
          qty: true,
          baseQty: true,
          receivedQty: true,
        },
      },
    },
  });
  if (!t) return null;
  return {
    ...t,
    // المستخدم يقدر يستلم؟ (التحويل لمستودعه) / يلغي؟ (من مستودعه)
    canReceiveHere: allowed(ids, t.toWarehouseId),
    canCancelHere: allowed(ids, t.fromWarehouseId),
    items: t.items.map((i) => ({
      ...i,
      qty: n(i.qty),
      baseQty: n(i.baseQty),
      receivedQty: i.receivedQty == null ? null : n(i.receivedQty),
    })),
  };
}

// ============================================================
// الجرد
// ============================================================

// الأصناف للجرد: رصيد البرنامج الحالي لكل صنف في المستودع
// categoryId: قسم معيّن، productIds: أصناف معيّنة
export async function getCountSheet({ warehouseId, categoryId, productIds }) {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(productIds?.length ? { id: { in: productIds } } : {}),
      ...(categoryId
        ? { OR: [{ categoryId }, { category: { parentId: categoryId } }] }
        : {}),
    },
    orderBy: { arName: "asc" },
    take: 2000,
    select: {
      id: true,
      code: true,
      arName: true,
      enName: true,
      ...unitsSelect,
      stockBalances: { where: { warehouseId }, select: { qty: true } },
    },
  });
  return products.map((p) => ({
    productId: p.id,
    code: p.code,
    arName: p.arName,
    enName: p.enName,
    unit: p.baseUnit,
    units: unitsOf(p),
    systemQty: n(p.stockBalances[0]?.qty),
  }));
}

async function assertCountWarehouse(warehouseId, user) {
  const ids = await userWarehouseIds(user);
  if (!allowed(ids, warehouseId)) throw new AppError("Forbidden");
  const w = await prisma.warehouse.findFirst({
    where: { id: warehouseId, isActive: true },
    select: { id: true },
  });
  if (!w) throw new AppError("WarehouseNotFound");
}

const countItemsData = (items) =>
  items.map((i) => ({
    productId: i.productId,
    countedQty: i.countedQty,
  }));

// مسودة جرد جديدة
export async function createCount(data, user) {
  await assertCountWarehouse(data.warehouseId, user);
  return runTx(async (tx) => {
    const number = await nextNumber(tx, "count");
    return tx.inventoryCount.create({
      data: {
        number,
        warehouseId: data.warehouseId,
        date: new Date(),
        notes: data.notes,
        createdById: user.id,
        items: { create: countItemsData(data.items) },
      },
      select: { id: true, number: true },
    });
  }, TX_OPTIONS);
}

// تعديل مسودة (قبل الترحيل فقط)
export async function updateCount({ id, ...data }, user) {
  const count = await prisma.inventoryCount.findUnique({
    where: { id },
    select: { status: true, warehouseId: true },
  });
  if (!count) throw new AppError("CountNotFound");
  if (count.status !== "draft") throw new AppError("CountAlreadyPosted");
  await assertCountWarehouse(count.warehouseId, user);
  return prisma.inventoryCount.update({
    where: { id },
    data: {
      notes: data.notes,
      items: { deleteMany: {}, create: countItemsData(data.items) },
    },
    select: { id: true, number: true },
  });
}

// الترحيل: الفرق بين الموجود فعلاً ورصيد البرنامج يصبح حركة مخزون
export async function postCount(id, user) {
  const count = await prisma.inventoryCount.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      warehouseId: true,
      items: {
        select: {
          id: true,
          productId: true,
          countedQty: true,
          product: { select: { cost: true } },
        },
      },
    },
  });
  if (!count) throw new AppError("CountNotFound");
  if (count.status !== "draft") throw new AppError("CountAlreadyPosted");
  if (!count.items.length) throw new AppError("NoItems");
  await assertCountWarehouse(count.warehouseId, user);
  const date = new Date();

  return runTx(async (tx) => {
    const { count: changed } = await tx.inventoryCount.updateMany({
      where: { id, status: "draft" },
      data: { status: "posted", postedAt: date, postedById: user.id },
    });
    if (!changed) throw new AppError("CountAlreadyPosted");

    const balances = await tx.stockBalance.findMany({
      where: {
        warehouseId: count.warehouseId,
        productId: { in: count.items.map((i) => i.productId) },
      },
      select: { productId: true, qty: true },
    });
    const systemOf = new Map(balances.map((b) => [b.productId, n(b.qty)]));

    const movements = [];
    for (const it of count.items) {
      const systemQty = systemOf.get(it.productId) ?? 0;
      const diff = round(n(it.countedQty) - systemQty, 4);
      await tx.inventoryCountItem.update({
        where: { id: it.id },
        data: { systemQty, diffQty: diff, cost: n(it.product.cost) },
      });
      movements.push({
        productId: it.productId,
        warehouseId: count.warehouseId,
        qty: diff,
        cost: n(it.product.cost),
        type: "count",
        refType: "count",
        refId: id,
        refNo: `${IC_PREFIX}-${count.number}`,
        date,
      });
    }
    await applyMovements(tx, movements, { allowNegative: true });
    return { id, number: count.number };
  }, TX_OPTIONS);
}

// حذف مسودة جرد (المرحّل لا يُحذف)
export async function deleteCount(id, user) {
  const count = await prisma.inventoryCount.findUnique({
    where: { id },
    select: { status: true, warehouseId: true },
  });
  if (!count) throw new AppError("CountNotFound");
  if (count.status !== "draft") throw new AppError("CountAlreadyPosted");
  await assertCountWarehouse(count.warehouseId, user);
  await prisma.inventoryCount.delete({ where: { id } });
  return { deleted: 1 };
}

export async function listCounts({ user, page = 1, pageSize = 20 }) {
  const ids = await userWarehouseIds(user);
  const where = ids === null ? {} : { warehouseId: { in: ids } };
  const [total, rows] = await Promise.all([
    prisma.inventoryCount.count({ where }),
    prisma.inventoryCount.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        status: true,
        date: true,
        postedAt: true,
        warehouse: warehouseSelect,
        _count: { select: { items: true } },
      },
    }),
  ]);
  return { total, page, pageSize, rows };
}

export async function getCount(id, user) {
  const ids = await userWarehouseIds(user);
  const c = await prisma.inventoryCount.findFirst({
    where: { id, ...(ids === null ? {} : { warehouseId: { in: ids } }) },
    select: {
      id: true,
      number: true,
      status: true,
      date: true,
      postedAt: true,
      notes: true,
      warehouseId: true,
      warehouse: warehouseSelect,
      createdBy: userSelect,
      postedBy: userSelect,
      items: {
        orderBy: { id: "asc" },
        select: {
          productId: true,
          systemQty: true,
          countedQty: true,
          diffQty: true,
          cost: true,
          product: {
            select: {
              code: true,
              arName: true,
              enName: true,
              ...unitsSelect,
              stockBalances: { select: { warehouseId: true, qty: true } },
            },
          },
        },
      },
    },
  });
  if (!c) return null;
  return {
    ...c,
    items: c.items.map((i) => ({
      productId: i.productId,
      code: i.product.code,
      arName: i.product.arName,
      enName: i.product.enName,
      unit: i.product.baseUnit,
      units: unitsOf(i.product),
      // المسودة: رصيد البرنامج الحالي / المرحّل: الرصيد وقت الترحيل
      systemQty:
        c.status === "posted"
          ? n(i.systemQty)
          : n(
              i.product.stockBalances.find(
                (b) => b.warehouseId === c.warehouseId,
              )?.qty,
            ),
      countedQty: n(i.countedQty),
      diffQty: n(i.diffQty),
      cost: n(i.cost),
    })),
  };
}
