import "server-only";
import { docNumberWhere, nextBranchNumber } from "./sequence.service";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/transaction";
import { AppError } from "@/lib/errors";
import { assertUnitQty } from "./unit.service";
import { can } from "@/lib/permissions";
import { dayOf, dayToDateTime, dayToDbDate, today } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import {
  applyMovements,
  isNegativeStockAllowed,
  reverseMovements,
} from "./stock.service";
import { userWarehouseIds } from "./inventory.service";
import {
  attachDamageSerials,
  attachSurplusSerials,
  prepareDamageSerials,
  preparePurchaseSerials,
  restoreDamageSerials,
  revertSurplusSerials,
  serialContext,
} from "./serial.service";

// ============================================================
// التوالف والزيادات
// - تالف (damage): الكمية بتنزل من المخزون (حركة damage بالسالب)
// - زيادة (surplus): الكمية بتتضاف للمخزون (حركة surplus بالموجب)
// - السبب لكل سطر (إلزامي في التالف)، والتكلفة = تكلفة الصنف وقت المستند
// - الإلغاء بيرجّع الحركات، والمستند بيفضل "ملغي" للسجل
// ============================================================

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };
const n = (v) => (v == null ? 0 : Number(v));
const round = (v, d) =>
  Math.round((Number(v) + Number.EPSILON) * 10 ** d) / 10 ** d;
const allowed = (ids, warehouseId) => ids === null || ids.includes(warehouseId);
// رقم المستند في حركات المخزون (DM-AJ-5 / القديم AJ-5)
const docNo = (number, code) => formatDocNo("adjustment", number, code);


// الأصناف والوحدات: نتحقق منها ونرجع معامل التحويل والتكلفة
async function resolveItems(items) {
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      code: true,
      arName: true,
      enName: true,
      cost: true,
      isService: true,
      baseUnitId: true,
      serialCount: true,
      trackExpiry: true,
      productUnits: { select: { unitId: true, conversionFactor: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const out = items.map((it, i) => {
    const p = byId.get(it.productId);
    if (!p)
      throw new AppError("ProductNotFound", null, {
        [`items.${i}.productId`]: "ProductNotFound",
      });
    // الخدمة مالهاش مخزون
    if (p.isService)
      throw new AppError("ServiceHasNoStock", [p.arName], {
        [`items.${i}.productId`]: "ServiceHasNoStock",
      });
    let factor = 1;
    if (it.unitId && it.unitId !== p.baseUnitId) {
      const pu = p.productUnits.find((u) => u.unitId === it.unitId);
      if (!pu) throw new AppError("InvalidUnit");
      factor = n(pu.conversionFactor);
    }
    return { ...it, product: p, unitId: it.unitId ?? p.baseUnitId, factor };
  });
  // الوحدة متقبلش كسور (حبة) ← الكمية لازم رقم صحيح
  await assertUnitQty(
    out.map((it) => ({
      productId: it.product.id,
      unitId: it.unitId,
      qty: it.qty,
      factor: it.factor,
    })),
  );
  return out;
}

// التحقق المشترك بين الإضافة والتعديل: المستودع والتاريخ والأصناف
async function prepare(data, user) {
  const ids = await userWarehouseIds(user);
  if (!allowed(ids, data.warehouseId)) throw new AppError("Forbidden");
  const wh = await prisma.warehouse.findFirst({
    where: { id: data.warehouseId, isActive: true },
    select: { id: true },
  });
  if (!wh) throw new AppError("WarehouseNotFound");
  const items = await resolveItems(data.items);
  // تتبع الصلاحية: الزيادة لازم دفعاتها تغطي الكمية بالظبط
  if (data.type === "surplus")
    items.forEach((it, i) => {
      if (!it.product.trackExpiry) return;
      const sum = (it.batches ?? []).reduce((s, b) => s + n(b.qty), 0);
      if (Math.abs(sum - n(it.qty)) > 0.0005)
        throw new AppError("BatchQtyMismatch", null, {
          [`items.${i}.batches`]: "BatchQtyMismatch",
        });
    });
  const now = today();
  const day = can(user, "stockAdjustments.changeDate")
    ? (data.date ?? now)
    : now;
  if (day > now) throw new AppError("FutureDate", null, { date: "FutureDate" });
  const ctx = await serialContext();
  // الزيادة: أرقام اختيارية بعدد القطع أو أقل (زي الشراء)
  const surplus =
    data.type === "surplus" ? preparePurchaseSerials(items, ctx) : null;
  return { ids, items, date: dayToDateTime(day), ctx, surplus };
}

// السطور + الحركات + الأرقام (جوه الـ transaction)
async function writeLines(
  tx,
  { id, number, docCode = null, type, warehouseId, date },
  p,
) {
  const damageSerials =
    type === "damage"
      ? await prepareDamageSerials(
          tx,
          p.items.map((it) => ({ ...it, serialIds: it.serialIds })),
          p.ctx,
        )
      : null;
  const itemIds = [];
  for (const it of p.items) {
    const row = await tx.stockAdjustmentItem.create({
      data: {
        adjustmentId: id,
        productId: it.product.id,
        code: it.product.code,
        arName: it.product.arName,
        enName: it.product.enName,
        unitId: it.unitId,
        factor: it.factor,
        qty: it.qty,
        baseQty: round(it.qty * it.factor, 4),
        cost: n(it.product.cost),
        reason: it.reason ?? null,
      },
      select: { id: true },
    });
    itemIds.push(row.id);
  }
  const sign = type === "damage" ? -1 : 1;
  // التالف بيراعي إعداد "السماح بالسالب"، والزيادة مالهاش مشكلة
  const allowNegative =
    type === "surplus" ? true : await isNegativeStockAllowed();
  await applyMovements(
    tx,
    p.items.map((it) => ({
      productId: it.product.id,
      warehouseId,
      qty: sign * round(it.qty * it.factor, 4),
      cost: n(it.product.cost),
      type,
      refType: "adjustment",
      refId: id,
      refNo: docNo(number, docCode),
      date,
      // تتبع الصلاحية: الزيادة بدفعاتها، والتالف من دفعة معيّنة (أو الأقرب انتهاءً)
      ...(it.product.trackExpiry && type === "surplus"
        ? {
            batches: (it.batches ?? []).map((b) => ({
              batchNo: b.batchNo ?? null,
              mfgDate: b.mfgDate ?? null,
              expDate: b.expDate,
              qty: round(n(b.qty) * it.factor, 4),
            })),
          }
        : {}),
      ...(it.product.trackExpiry && type === "damage" && it.batchId
        ? {
            batchIds: [
              { batchId: it.batchId, qty: round(it.qty * it.factor, 4) },
            ],
          }
        : {}),
    })),
    { allowNegative },
  );
  if (damageSerials) await attachDamageSerials(tx, itemIds, damageSerials);
  if (p.surplus)
    await attachSurplusSerials(
      tx,
      itemIds,
      p.surplus.map((x, i) => ({
        ...x,
        productId: p.items[i].product.id,
      })),
    );
}

// رجوع المستند: الأرقام ترجع لحالتها + الحركات تتشال
async function undo(tx, a) {
  if (a.type === "damage") await restoreDamageSerials(tx, a.id);
  else await revertSurplusSerials(tx, a.id);
  // إلغاء زيادة بينزّل الكمية: يراعي إعداد السالب
  const allowNegative =
    a.type === "damage" ? true : await isNegativeStockAllowed();
  await reverseMovements(tx, "adjustment", a.id, { allowNegative });
}

export async function createAdjustment(data, user) {
  const p = await prepare(data, user);
  return runTx(async (tx) => {
    const { number, docCode } = await nextBranchNumber(
      tx,
      "adjustment",
      user.branch.id,
    );
    const created = await tx.stockAdjustment.create({
      data: {
        number,
        docCode,
        branchId: user.branch.id,
        type: data.type,
        warehouseId: data.warehouseId,
        date: p.date,
        notes: data.notes ?? null,
        createdById: user.id,
      },
      select: { id: true, number: true, docCode: true },
    });
    await writeLines(
      tx,
      {
        id: created.id,
        number,
        docCode,
        type: data.type,
        warehouseId: data.warehouseId,
        date: p.date,
      },
      p,
    );
    return created;
  }, TX_OPTIONS);
}

// تعديل: نفس النوع والرقم، والباقي كله يتغير
// (الحركات والأرقام القديمة بترجع، والجديدة بتتسجل)
export async function updateAdjustment({ id, ...data }, user) {
  const a = await prisma.stockAdjustment.findUnique({
    where: { id },
    select: {
      id: true,
      number: true, docCode: true,
      status: true,
      type: true,
      warehouseId: true,
    },
  });
  if (!a) throw new AppError("AdjustmentNotFound");
  if (a.status !== "posted") throw new AppError("AdjustmentCancelled");
  const p = await prepare({ ...data, type: a.type }, user);
  if (!allowed(p.ids, a.warehouseId)) throw new AppError("Forbidden");

  return runTx(async (tx) => {
    const { count } = await tx.stockAdjustment.updateMany({
      where: { id, status: "posted" },
      data: {
        warehouseId: data.warehouseId,
        date: p.date,
        notes: data.notes ?? null,
      },
    });
    if (!count) throw new AppError("AdjustmentCancelled");
    await undo(tx, a);
    await tx.stockAdjustmentItem.deleteMany({ where: { adjustmentId: id } });
    await writeLines(
      tx,
      {
        id,
        number: a.number,
        docCode: a.docCode,
        type: a.type,
        warehouseId: data.warehouseId,
        date: p.date,
      },
      p,
    );
    return { id, number: a.number, docCode: a.docCode };
  }, TX_OPTIONS);
}

// إلغاء: الحركات بترجع (تالف ← الكمية ترجع للمخزون، زيادة ← تنزل)
export async function cancelAdjustment(id, user) {
  const a = await prisma.stockAdjustment.findUnique({
    where: { id },
    select: { id: true, status: true, type: true, warehouseId: true },
  });
  if (!a) throw new AppError("AdjustmentNotFound");
  if (a.status !== "posted") throw new AppError("AdjustmentCancelled");
  const ids = await userWarehouseIds(user);
  if (!allowed(ids, a.warehouseId)) throw new AppError("Forbidden");

  return runTx(async (tx) => {
    const { count } = await tx.stockAdjustment.updateMany({
      where: { id, status: "posted" },
      data: { status: "cancelled", cancelledAt: new Date() },
    });
    if (!count) throw new AppError("AdjustmentCancelled");
    await undo(tx, a);
    return { id };
  }, TX_OPTIONS);
}

const nameSelect = { select: { id: true, arName: true, enName: true } };
const userSelect = { select: { arFullname: true, enFullname: true } };

export async function listAdjustments({
  user,
  type,
  q = "",
  page = 1,
  pageSize = 20,
}) {
  const ids = await userWarehouseIds(user);
  // رقم المستند: في فرع الرمز (DM-AJ-5) أو فرع المستخدم
  const ref = q.trim() ? await docNumberWhere(q, user) : null;
  const where = {
    ...(ids === null ? {} : { warehouseId: { in: ids } }),
    ...(type ? { type } : {}),
    ...(ref ? { number: ref.number, AND: [{ branchId: ref.branchId }] } : {}),
  };
  const [total, rows, counts] = await Promise.all([
    prisma.stockAdjustment.count({ where }),
    prisma.stockAdjustment.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true, docCode: true,
        type: true,
        status: true,
        date: true,
        warehouse: nameSelect,
        createdBy: userSelect,
        items: { select: { baseQty: true, cost: true } },
        _count: { select: { items: true } },
      },
    }),
    // عدد كل نوع (أزرار الفلتر) بنفس البحث
    prisma.stockAdjustment.groupBy({
      by: ["type"],
      where: { ...where, type: undefined },
      _count: { _all: true },
    }),
  ]);
  const byType = Object.fromEntries(counts.map((c) => [c.type, c._count._all]));
  return {
    total,
    page,
    pageSize,
    counts: {
      damage: byType.damage ?? 0,
      surplus: byType.surplus ?? 0,
      all: (byType.damage ?? 0) + (byType.surplus ?? 0),
    },
    rows: rows.map(({ items, ...r }) => ({
      ...r,
      value: round(
        items.reduce((s, i) => s + n(i.baseQty) * n(i.cost), 0),
        2,
      ),
    })),
  };
}

export async function getAdjustment(id, user) {
  const ids = await userWarehouseIds(user);
  const a = await prisma.stockAdjustment.findFirst({
    where: { id, ...(ids === null ? {} : { warehouseId: { in: ids } }) },
    select: {
      id: true,
      number: true, docCode: true,
      type: true,
      status: true,
      date: true,
      notes: true,
      cancelledAt: true,
      updatedAt: true,
      warehouse: nameSelect,
      createdBy: userSelect,
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          productId: true,
          code: true,
          arName: true,
          enName: true,
          unit: nameSelect,
          qty: true,
          baseQty: true,
          cost: true,
          reason: true,
          unitId: true,
          surplusSerials: {
            orderBy: { id: "asc" },
            select: { id: true, serial: true, serial2: true, isUsed: true },
          },
          damagedSerials: {
            orderBy: { id: "asc" },
            select: { id: true, serial: true, serial2: true },
          },
        },
      },
    },
  });
  if (!a) return null;
  const items = a.items.map((i) => ({
    ...i,
    qty: n(i.qty),
    baseQty: n(i.baseQty),
    cost: n(i.cost),
    value: round(n(i.baseQty) * n(i.cost), 2),
  }));
  return {
    ...a,
    // يوم المستند (لشاشة التعديل)
    day: dayOf(a.date),
    items,
    total: round(
      items.reduce((s, i) => s + i.value, 0),
      2,
    ),
  };
}

// ============================================================
// إتلاف دفعات (تتبع الصلاحية): مستند تالف لكل مستودع، سطر لكل دفعة بكل رصيدها
// batchIds: الدفعات (من تقرير الصلاحية) / reason: سبب التالف
// ============================================================
export async function disposeBatches(batchIds, user, reason) {
  const ids = await userWarehouseIds(user);
  const batches = await prisma.productBatch.findMany({
    where: {
      id: { in: batchIds },
      qty: { gt: 0 },
      ...(ids === null ? {} : { warehouseId: { in: ids } }),
    },
    select: {
      id: true,
      warehouseId: true,
      qty: true,
      product: { select: { id: true, baseUnitId: true } },
    },
  });
  if (!batches.length) return { created: [] };
  const byWarehouse = new Map();
  for (const b of batches) {
    const list = byWarehouse.get(b.warehouseId) ?? [];
    list.push(b);
    byWarehouse.set(b.warehouseId, list);
  }
  const created = [];
  for (const [warehouseId, list] of byWarehouse) {
    created.push(
      await createAdjustment(
        {
          type: "damage",
          warehouseId,
          notes: reason,
          items: list.map((b) => ({
            productId: b.product.id,
            unitId: b.product.baseUnitId,
            qty: Math.round(n(b.qty) * 1000) / 1000,
            reason,
            serialIds: [],
            serials: [],
            batches: [],
            batchId: b.id,
          })),
        },
        user,
      ),
    );
  }
  return { created };
}

// الإتلاف التلقائي (إعداد "إتلاف المنتهي تلقائياً"): الدفعات المنتهية في مستودعات المستخدم
// بيتنادى من تقرير الصلاحية وتنبيهات الجرس (مرة كل ما حد يفتحهم)
export async function autoDisposeExpired(user, reason) {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { expiryAutoDispose: true },
  });
  if (!settings?.expiryAutoDispose) return null;
  const ids = await userWarehouseIds(user);
  const expired = await prisma.productBatch.findMany({
    where: {
      qty: { gt: 0 },
      expDate: { lt: dayToDbDate(today()) },
      product: { trackExpiry: true },
      ...(ids === null ? {} : { warehouseId: { in: ids } }),
    },
    select: { id: true },
  });
  if (!expired.length) return null;
  return disposeBatches(
    expired.map((b) => b.id),
    user,
    reason,
  );
}
