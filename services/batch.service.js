import "server-only";
import { AppError } from "@/lib/errors";
import { dayToDbDate, today } from "@/lib/dates";

// ============================================================
// محرك الدفعات (تتبع الصلاحية - ميزة expiry)
// بيشتغل جوه محرك المخزون (applyMovements / reverseMovements) للأصناف
// المتتبعة بالصلاحية بس (product.trackExpiry)، فكل المستندات بتمشي عليه:
//
// حركة داخلة (qty > 0):
//   - batches: [{ batchNo?, mfgDate?, expDate?, qty }] الدفعات المكتوبة (الشراء...)
//   - batchFrom: { refType, refId } نفس دفعات مستند تاني
//       (مرتجع البيع ← نفس دفعات الفاتورة / استلام التحويل ← دفعات الإرسال)
//   - غير كده: دفعة "غير محددة" (من غير تاريخ، بتخرج آخر حاجة)
// حركة خارجة (qty < 0):
//   - batchIds: [{ batchId, qty }] دفعة معيّنة (مسح باركود الدفعة)
//   - batchFrom: { refType, refId } من دفعات مستند (مرتجع الشراء ← دفعات الفاتورة)
//   - غير كده: من الأقرب انتهاءً (FEFO)
//   - البيع (type = sale): المنتهي ممنوع لو الإعداد expiryBlockSale
// كل اللي اتاخد/اتحط بيتسجل في batch_moves (للإلغاء وكارت الدفعة)
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const EPS = 1e-6;
const round4 = (v) => Math.round((Number(v) + Number.EPSILON) * 1e4) / 1e4;

// رقم الدفعة "غير المحددة" (حركة داخلة من غير بيانات دفعة)
export const NO_BATCH = "-";
// أنواع الحركات اللي بتتمنع من المنتهي (البيع)
const SALE_TYPES = new Set(["sale"]);

// التاريخ (YYYY-MM-DD أو Date) ← تاريخ القاعدة، وفاضي ← null
const toDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  return dayToDbDate(String(v).slice(0, 10));
};
// رقم دفعة تلقائي من تاريخ الانتهاء (نفس التاريخ = نفس الدفعة)
const autoBatchNo = (exp) =>
  exp ? `E${exp.toISOString().slice(0, 10).replaceAll("-", "")}` : NO_BATCH;

// الأصناف المتتبعة من مجموعة حركات
async function trackedSet(tx, rows) {
  const ids = [...new Set(rows.map((m) => m.productId))];
  if (!ids.length) return new Set();
  const list = await tx.product.findMany({
    where: { id: { in: ids }, trackExpiry: true },
    select: { id: true },
  });
  return new Set(list.map((p) => p.id));
}

// دفعة في مستودع (بتتعمل لو مش موجودة)
async function ensureBatch(
  tx,
  { productId, warehouseId, batchNo, mfgDate, expDate },
) {
  const no = String(batchNo || autoBatchNo(expDate))
    .trim()
    .slice(0, 50);
  const existing = await tx.productBatch.findUnique({
    where: {
      productId_warehouseId_batchNo: { productId, warehouseId, batchNo: no },
    },
  });
  if (existing) {
    // نفس رقم الدفعة بتاريخ انتهاء مختلف: غلط في الإدخال
    if (
      expDate &&
      existing.expDate &&
      existing.expDate.getTime() !== expDate.getTime()
    )
      throw new AppError("BatchExpiryMismatch", { batchNo: no });
    if (expDate && !existing.expDate)
      return tx.productBatch.update({
        where: { id: existing.id },
        data: { expDate, ...(mfgDate ? { mfgDate } : {}) },
      });
    return existing;
  }
  return tx.productBatch.create({
    data: { productId, warehouseId, batchNo: no, mfgDate, expDate },
  });
}

async function move(tx, batch, qty, m) {
  await tx.productBatch.update({
    where: { id: batch.id },
    data: { qty: { increment: round4(qty) } },
  });
  await tx.batchMove.create({
    data: {
      batchId: batch.id,
      qty: round4(qty),
      moveType: m.type,
      refType: m.refType,
      refId: m.refId,
      refNo: m.refNo ?? null,
      moveDate: m.date ?? new Date(),
    },
  });
}

// حركات مستند تاني على الصنف ده (مجمّعة لكل دفعة)
async function refMoves(tx, from, productId) {
  const moves = await tx.batchMove.findMany({
    where: {
      refType: from.refType,
      refId: from.refId,
      batch: { productId },
    },
    select: {
      qty: true,
      batch: {
        select: {
          id: true,
          warehouseId: true,
          batchNo: true,
          mfgDate: true,
          expDate: true,
        },
      },
    },
  });
  const byBatch = new Map();
  for (const mv of moves) {
    const cur = byBatch.get(mv.batch.id) ?? { batch: mv.batch, qty: 0 };
    cur.qty += n(mv.qty);
    byBatch.set(mv.batch.id, cur);
  }
  return [...byBatch.values()];
}

// ------------------------------------------------------------
// حركة داخلة
// ------------------------------------------------------------
async function incoming(tx, m) {
  let rest = round4(n(m.qty));
  const put = async (def, qty) => {
    const q = Math.min(rest, round4(qty));
    if (q <= EPS) return;
    const batch = await ensureBatch(tx, {
      productId: m.productId,
      warehouseId: m.warehouseId,
      ...def,
    });
    await move(tx, batch, q, m);
    rest = round4(rest - q);
  };

  if (Array.isArray(m.batches) && m.batches.length) {
    for (const b of m.batches)
      await put(
        {
          batchNo: b.batchNo,
          mfgDate: toDate(b.mfgDate),
          expDate: toDate(b.expDate),
        },
        n(b.qty),
      );
  } else if (m.batchFrom) {
    // نفس دفعات المستند التاني: اللي اتاخد منها (سالب) يرجع / يتنقل
    // (الأحدث انتهاءً الأول، عشان المرتجع يرجع للأطول عمراً)
    const used = (await refMoves(tx, m.batchFrom, m.productId))
      .filter((u) => u.qty < -EPS)
      .sort(
        (a, b) =>
          (b.batch.expDate?.getTime() ?? Infinity) -
          (a.batch.expDate?.getTime() ?? Infinity),
      );
    for (const u of used)
      await put(
        {
          batchNo: u.batch.batchNo,
          mfgDate: u.batch.mfgDate,
          expDate: u.batch.expDate,
        },
        -u.qty,
      );
  }
  // الباقي من غير بيانات دفعة: الدفعة غير المحددة
  if (rest > EPS) await put({ batchNo: NO_BATCH }, rest);
}

// ------------------------------------------------------------
// حركة خارجة
// ------------------------------------------------------------
async function outgoing(tx, m, settings, todayDate) {
  let rest = round4(-n(m.qty));
  const take = async (batch, available, qty) => {
    const q = Math.min(rest, available, round4(qty));
    if (q <= EPS) return;
    await move(tx, batch, -q, m);
    rest = round4(rest - q);
  };
  const blockExpired = SALE_TYPES.has(m.type) && settings.expiryBlockSale;
  const expired = (b) => b.expDate && b.expDate.getTime() < todayDate.getTime();

  // 1) دفعة معيّنة (مسح باركود الدفعة)
  if (Array.isArray(m.batchIds) && m.batchIds.length) {
    for (const pick of m.batchIds) {
      const b = await tx.productBatch.findFirst({
        where: {
          id: pick.batchId,
          productId: m.productId,
          warehouseId: m.warehouseId,
        },
      });
      if (!b) continue;
      if (blockExpired && expired(b))
        throw new AppError("ExpiredBatch", { batchNo: b.batchNo });
      await take(b, n(b.qty), n(pick.qty));
    }
  }
  // 2) من دفعات مستند تاني (مرتجع الشراء ← دفعات الفاتورة)
  if (rest > EPS && m.batchFrom) {
    const added = (await refMoves(tx, m.batchFrom, m.productId)).filter(
      (u) => u.qty > EPS && u.batch.warehouseId === m.warehouseId,
    );
    for (const u of added) {
      const b = await tx.productBatch.findUnique({ where: { id: u.batch.id } });
      if (b) await take(b, n(b.qty), u.qty);
    }
  }
  // 3) الباقي: الأقرب انتهاءً (والمنتهي ممنوع في البيع لو الإعداد)
  if (rest > EPS) {
    const list = await tx.productBatch.findMany({
      where: {
        productId: m.productId,
        warehouseId: m.warehouseId,
        qty: { gt: 0 },
      },
    });
    list.sort(
      (a, b) =>
        (a.expDate?.getTime() ?? Infinity) -
          (b.expDate?.getTime() ?? Infinity) || a.id - b.id,
    );
    let skippedExpired = 0;
    for (const b of list) {
      if (rest <= EPS) break;
      if (blockExpired && expired(b)) {
        skippedExpired += n(b.qty);
        continue;
      }
      await take(b, n(b.qty), rest);
    }
    // مفيش غير منتهي يكفي البيع (والمنتهي موجود): البيع ممنوع
    if (rest > EPS && skippedExpired > EPS)
      throw new AppError("ExpiredStockOnly", [
        {
          productId: m.productId,
          available: round4(-n(m.qty) - rest),
          requested: round4(-n(m.qty)),
        },
      ]);
  }
  // الباقي (البيع بالسالب مسموح): مالوش دفعة
}

// ------------------------------------------------------------
// تطبيق حركات مستند على الدفعات (من applyMovements)
// rows: حركات المخزون (من غير الخدمات)
// loadSettings: إعدادات النظام (بتتجاب بس لو فيه أصناف متتبعة)
// ------------------------------------------------------------
export async function applyBatchMoves(tx, rows, loadSettings) {
  const tracked = await trackedSet(tx, rows);
  if (!tracked.size) return;
  const settings = await loadSettings();
  const todayDate = dayToDbDate(today());
  // الخارج قبل الداخل (التحويل في نفس المستند)، وترتيب ثابت للأقفال
  const list = rows
    .filter((m) => tracked.has(m.productId))
    .sort(
      (a, b) =>
        n(a.qty) - n(b.qty) ||
        a.productId - b.productId ||
        a.warehouseId - b.warehouseId,
    );
  for (const m of list) {
    if (n(m.qty) > EPS) await incoming(tx, m);
    else if (n(m.qty) < -EPS) await outgoing(tx, m, settings, todayDate);
  }
}

// ------------------------------------------------------------
// إلغاء حركات مستند على الدفعات (من reverseMovements)
// types: أنواع حركات معيّنة بس (نفس فلتر حركات المخزون)
// ------------------------------------------------------------
export async function reverseBatchMoves(tx, refType, refId, types) {
  const where = {
    refType,
    refId,
    ...(types ? { moveType: { in: types } } : {}),
  };
  const moves = await tx.batchMove.findMany({
    where,
    select: { batchId: true, qty: true },
  });
  if (!moves.length) return;
  const byBatch = new Map();
  for (const mv of moves)
    byBatch.set(mv.batchId, (byBatch.get(mv.batchId) ?? 0) + n(mv.qty));
  for (const [batchId, qty] of [...byBatch.entries()].sort(
    (a, b) => a[0] - b[0],
  ))
    await tx.productBatch.update({
      where: { id: batchId },
      data: { qty: { decrement: round4(qty) } },
    });
  await tx.batchMove.deleteMany({ where });
}

// ------------------------------------------------------------
// مطابقة دفعات صنف مع رصيده في كل مستودع:
// الرصيد اللي مالوش دفعة (قبل التتبع / الرصيد الافتتاحي) ← الدفعة غير المحددة
// (بتتنادى لما الصنف يتعلّم "متتبع" أو رصيده الافتتاحي يتغير)
// ------------------------------------------------------------
export async function alignBatches(db, productId) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { trackExpiry: true },
  });
  if (!product?.trackExpiry) return;
  const [balances, batches] = await Promise.all([
    db.stockBalance.findMany({
      where: { productId },
      select: { warehouseId: true, qty: true },
    }),
    db.productBatch.groupBy({
      by: ["warehouseId"],
      where: { productId },
      _sum: { qty: true },
    }),
  ]);
  const inBatches = new Map(batches.map((b) => [b.warehouseId, n(b._sum.qty)]));
  for (const bal of balances) {
    const diff = round4(n(bal.qty) - (inBatches.get(bal.warehouseId) ?? 0));
    if (Math.abs(diff) <= EPS) continue;
    const batch = await ensureBatch(db, {
      productId,
      warehouseId: bal.warehouseId,
      batchNo: NO_BATCH,
      mfgDate: null,
      expDate: null,
    });
    // الدفعة غير المحددة متنزلش تحت الصفر
    const next = Math.max(0, round4(n(batch.qty) + diff));
    await db.productBatch.update({
      where: { id: batch.id },
      data: { qty: next },
    });
  }
}

// ============================================================
// تقرير الصلاحية: الدفعات اللي فيها رصيد، وحالتها
// filters: { warehouseId?, status?: all|near|expired, days?, q? }
// - near: هتنتهي خلال days يوم (أو أيام تنبيه الصنف / الشركة لو مش محدد)
// - expired: انتهت
// warehouseIds: المستودعات اللي المستخدم يشوفها
// ============================================================
export async function listBatches(filters, warehouseIds, db) {
  const settings = await db.systemSettings.findUnique({
    where: { id: 1 },
    select: { expiryAlertDays: true },
  });
  const defaultDays = settings?.expiryAlertDays ?? 30;
  const todayDate = dayToDbDate(today());
  const q = String(filters.q ?? "").trim();
  const rows = await db.productBatch.findMany({
    where: {
      qty: { gt: 0 },
      // تاريخ الانتهاء: من / إلى (أو قبل تاريخ = "إلى" بس) - الدفعات من غير تاريخ بتطلع برّه
      ...(filters.from || filters.to
        ? {
            expDate: {
              ...(filters.from ? { gte: dayToDbDate(filters.from) } : {}),
              ...(filters.to ? { lte: dayToDbDate(filters.to) } : {}),
            },
          }
        : {}),
      warehouseId: filters.warehouseId
        ? filters.warehouseId
        : { in: warehouseIds },
      product: {
        trackExpiry: true,
        ...(q
          ? {
              OR: [
                { code: { contains: q } },
                { arName: { contains: q } },
                { enName: { contains: q } },
              ],
            }
          : {}),
      },
    },
    orderBy: [{ expDate: "asc" }, { id: "asc" }],
    take: 3000,
    select: {
      id: true,
      batchNo: true,
      mfgDate: true,
      expDate: true,
      qty: true,
      warehouse: { select: { id: true, arName: true, enName: true } },
      product: {
        select: {
          id: true,
          code: true,
          arName: true,
          enName: true,
          cost: true,
          expiryAlertDays: true,
          baseUnit: { select: { arName: true, enName: true } },
        },
      },
    },
  });
  const DAY = 86_400_000;
  const list = rows.map((b) => {
    const daysLeft = b.expDate
      ? Math.round((b.expDate.getTime() - todayDate.getTime()) / DAY)
      : null;
    const alertDays = filters.days ?? b.product.expiryAlertDays ?? defaultDays;
    const status =
      daysLeft == null
        ? "none"
        : daysLeft < 0
          ? "expired"
          : daysLeft <= alertDays
            ? "near"
            : "ok";
    const qty = n(b.qty);
    return {
      id: b.id,
      batchNo: b.batchNo,
      mfgDate: b.mfgDate ? b.mfgDate.toISOString().slice(0, 10) : null,
      expDate: b.expDate ? b.expDate.toISOString().slice(0, 10) : null,
      daysLeft,
      status,
      qty,
      value: round4(qty * n(b.product.cost)),
      warehouse: b.warehouse,
      product: {
        id: b.product.id,
        code: b.product.code,
        arName: b.product.arName,
        enName: b.product.enName,
        unit: b.product.baseUnit,
      },
    };
  });
  const filtered =
    filters.status === "expired"
      ? list.filter((r) => r.status === "expired")
      : filters.status === "near"
        ? list.filter((r) => r.status === "near")
        : list;
  const sum = (s) =>
    list
      .filter((r) => r.status === s)
      .reduce(
        (a, r) => ({ count: a.count + 1, value: round4(a.value + r.value) }),
        { count: 0, value: 0 },
      );
  return {
    rows: filtered,
    totals: { near: sum("near"), expired: sum("expired") },
    defaultDays,
  };
}

// دفعات صنف في مستودع (فيها رصيد) - لاختيار دفعة التالف / البيع
export async function productBatches(db, productId, warehouseId) {
  const rows = await db.productBatch.findMany({
    where: { productId, warehouseId, qty: { gt: 0 } },
    select: { id: true, batchNo: true, mfgDate: true, expDate: true, qty: true },
  });
  return rows
    .sort(
      (a, b) =>
        (a.expDate?.getTime() ?? Infinity) - (b.expDate?.getTime() ?? Infinity),
    )
    .map((b) => ({
      id: b.id,
      batchNo: b.batchNo,
      mfgDate: b.mfgDate ? b.mfgDate.toISOString().slice(0, 10) : null,
      expDate: b.expDate ? b.expDate.toISOString().slice(0, 10) : null,
      qty: n(b.qty),
    }));
}

// دفعات مستند (للتعديل): لكل صنف ← [{ batchId, batchNo, mfgDate, expDate, qty(أساسية) }]
// sign: 1 = اللي دخل بالمستند / -1 = اللي خرج
export async function docBatches(db, refType, refId, sign = 1) {
  const moves = await db.batchMove.findMany({
    where: { refType, refId, qty: sign > 0 ? { gt: 0 } : { lt: 0 } },
    select: {
      qty: true,
      batch: {
        select: {
          id: true,
          productId: true,
          batchNo: true,
          mfgDate: true,
          expDate: true,
        },
      },
    },
  });
  const out = {};
  for (const mv of moves) {
    (out[mv.batch.productId] ??= []).push({
      batchId: mv.batch.id,
      batchNo: mv.batch.batchNo === NO_BATCH ? null : mv.batch.batchNo,
      mfgDate: mv.batch.mfgDate
        ? mv.batch.mfgDate.toISOString().slice(0, 10)
        : null,
      expDate: mv.batch.expDate
        ? mv.batch.expDate.toISOString().slice(0, 10)
        : null,
      qty: Math.abs(n(mv.qty)),
    });
  }
  return out;
}

// كارت الدفعة: بياناتها وكل حركاتها (بالترتيب) - warehouseIds: مستودعات المستخدم (null = الكل)
export async function batchCard(db, batchId, warehouseIds) {
  const batch = await db.productBatch.findFirst({
    where: {
      id: batchId,
      ...(warehouseIds === null ? {} : { warehouseId: { in: warehouseIds } }),
    },
    select: {
      id: true,
      batchNo: true,
      mfgDate: true,
      expDate: true,
      qty: true,
      product: { select: { arName: true, enName: true, code: true } },
      warehouse: { select: { arName: true, enName: true } },
      moves: {
        orderBy: [{ moveDate: "asc" }, { id: "asc" }],
        select: {
          id: true,
          qty: true,
          moveType: true,
          refType: true,
          refId: true,
          refNo: true,
          moveDate: true,
        },
      },
    },
  });
  if (!batch) return null;
  let balance = 0;
  return {
    id: batch.id,
    batchNo: batch.batchNo,
    mfgDate: batch.mfgDate ? batch.mfgDate.toISOString().slice(0, 10) : null,
    expDate: batch.expDate ? batch.expDate.toISOString().slice(0, 10) : null,
    qty: n(batch.qty),
    product: batch.product,
    warehouse: batch.warehouse,
    moves: batch.moves.map((m) => {
      balance += n(m.qty);
      return {
        id: m.id,
        qty: n(m.qty),
        moveType: m.moveType,
        refType: m.refType,
        refId: m.refId,
        refNo: m.refNo,
        date: m.moveDate.toISOString().slice(0, 10),
        balance: Math.round(balance * 10000) / 10000,
      };
    }),
  };
}
