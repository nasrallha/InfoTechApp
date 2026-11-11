import "server-only";
import { docNumberWhere, nextBranchNumber } from "./sequence.service";
import { recomputeAvgCost } from "./cost.service";
import { partyInBranch } from "@/lib/party-scope";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/transaction";
import { saveOnce } from "@/lib/idempotency";
import { AppError } from "@/lib/errors";
import { assertUnitQty } from "./unit.service";
import {
  asModel,
  collapseModels,
  modelFields,
  modelHeadsWhere,
  variantsEnabled,
} from "./model-list";
import { isWholeQty } from "@/lib/unit-qty";
import { can } from "@/lib/permissions";
import {
  calcInvoice,
  calcReturnLine,
  qtyMinus,
  round,
  totalsOf,
} from "@/lib/invoice-calc";
import {
  dayOf,
  dayToDateTime,
  dayToDbDate,
  dbDateToDay,
  today,
} from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import {
  applyMovements,
  getMainWarehouseId,
  isNegativeStockAllowed,
  reverseMovements,
} from "./stock.service";
import { getSystemSettings } from "./system-settings.service";
import { getBaseCurrency } from "./currency.service";
import { assertNoCodesInNumbers } from "./scan-guard.service";
import {
  attachPurchaseReturnSerials,
  attachPurchaseSerials,
  dropUnusedPurchaseSerials,
  preparePurchaseReturnSerials,
  preparePurchaseSerials,
  purchaseSerialIds,
  restorePurchaseReturnSerials,
  serialContext,
  stockSerialsByPurchaseItem,
} from "./serial.service";

// ============================================================
// المشتريات: فاتورة الشراء ومرتجع الشراء
// - السيرفر يعيد حساب كل المبالغ بنفسه (لا يثق في أرقام المتصفح)
// - الفاتورة بعد الحفظ لا تُعدل ولا تُحذف، والتصحيح بمرتجع
// - المرتجع مربوط بفاتورته، ولا يتجاوز الكمية المتاحة من كل صنف
// ============================================================

export const PURCHASE = "purchase";
export const PURCHASE_RETURN = "return";

// مفتاح المسلسل لكل نوع (موجود في جدول document_sequences)
// نوع المستند ← مفتاحه في sequence.service (BRANCH_DOCS)
const SEQUENCE_KEY = {
  [PURCHASE]: "purchase",
  [PURCHASE_RETURN]: "purchaseReturn",
};

// الفاتورة الكبيرة (مئات الأصناف) تحتاج وقتاً أطول من الافتراضي (5 ثوان)
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

const n = (v) => (v == null ? 0 : Number(v));

// ------------------------------------------------------------
// الفروع: المستخدم يرى فواتير فرعه فقط، إلا لو يملك "عرض كل الفروع"
// ------------------------------------------------------------
export const canViewAllBranches = (user) => can(user, "allBranches.view");
const branchScope = (user) =>
  !user || canViewAllBranches(user) ? {} : { branchId: user.branch.id };

// ------------------------------------------------------------
// مستودع فاتورة الشراء
// - من يملك "اختيار المستودع": المستودع الذي اختاره
// - غير ذلك: مستودع الفاتورة نفسها (تعديل) أو مستودع فرع المستخدم (إضافة)
// - الفرع بدون مستودع ← المستودع الرئيسي
// ------------------------------------------------------------
async function resolveWarehouse(data, user, existing) {
  let id = null;
  if (data.warehouseId && can(user, "purchases.chooseWarehouse")) {
    id = data.warehouseId;
  } else if (existing?.warehouseId) {
    id = existing.warehouseId;
  } else {
    const branch = await prisma.branch.findUnique({
      where: { id: user.branch.id },
      select: { warehouseId: true },
    });
    id = branch?.warehouseId ?? (await getMainWarehouseId());
  }
  const warehouse = id
    ? await prisma.warehouse.findFirst({
        where: {
          id,
          ...(existing?.warehouseId === id ? {} : { isActive: true }),
        },
        select: { id: true },
      })
    : null;
  if (!warehouse) {
    throw new AppError("WarehouseNotFound", null, {
      warehouseId: "WarehouseNotFound",
    });
  }
  return warehouse.id;
}

// حركات المخزون لفاتورة شراء (دخول) أو مرتجع (خروج)
// lines: { productId, baseQty, netAmount }
// batchFrom: مرتجع ← من دفعات الفاتورة الأصلية / l.batches: دفعات السطر (الشراء)
function purchaseMovements({
  type,
  id,
  number,
  docCode = null,
  date,
  warehouseId,
  lines,
  batchFrom = null,
}) {
  const sign = type === PURCHASE ? 1 : -1;
  return lines.map((l) => ({
    ...(l.batches ? { batches: l.batches } : {}),
    ...(batchFrom ? { batchFrom } : {}),
    productId: l.productId,
    warehouseId,
    qty: sign * n(l.baseQty),
    // تكلفة الوحدة الأساسية = الصافي بدون الضريبة ÷ الكمية
    cost: n(l.baseQty) > 0 ? n(l.netAmount) / n(l.baseQty) : 0,
    type: type === PURCHASE ? "purchase" : "purchase_return",
    refType: "purchase",
    refId: id,
    refNo: formatDocNo(type, number, docCode),
    date,
  }));
}

// الرقم التالي للمستند (داخل transaction: الصف يُقفل حتى نهاية العملية)
// الرقم التالي في فرع المستند + رمز الفرع (DM-PI-5) - مفيش تكرار مهما كان عدد المستخدمين
async function nextNumber(tx, type, branchId) {
  return nextBranchNumber(tx, SEQUENCE_KEY[type], branchId);
}

// ------------------------------------------------------------
// التحقق من المدفوعات وتجهيزها
// - طرق دفع نشطة، وليست "آجل" (الآجل = المتبقي)
// - رقم العملية مطلوب لو الطريقة تتطلبه
// - المدفوع لا يتجاوز الإجمالي
// ------------------------------------------------------------
async function preparePayments(db, payments, total, decimals) {
  if (!payments.length) return { rows: [], paid: 0 };

  const ids = [...new Set(payments.map((p) => p.paymentMethodId))];
  const methods = await db.paymentMethod.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, type: true, requiresReference: true },
  });
  const byId = new Map(methods.map((m) => [m.id, m]));

  const rows = payments.map((p, i) => {
    const method = byId.get(p.paymentMethodId);
    if (!method || method.type === "credit") {
      throw new AppError("PaymentMethodNotFound", null, {
        [`payments.${i}.paymentMethodId`]: "PaymentMethodNotFound",
      });
    }
    if (method.requiresReference && !p.reference) {
      throw new AppError("ReferenceRequired", null, {
        [`payments.${i}.reference`]: "ReferenceRequired",
      });
    }
    return {
      paymentMethodId: p.paymentMethodId,
      amount: round(p.amount, decimals),
      reference: p.reference ?? null,
    };
  });

  const paid = round(
    rows.reduce((s, r) => s + r.amount, 0),
    decimals,
  );
  if (paid > total) throw new AppError("PaymentExceedsTotal");

  return { rows, paid };
}

// ============================================================
// تجهيز فاتورة شراء (للإضافة والتعديل): التحقق من كل شيء وحساب المبالغ
// existing: الفاتورة الحالية في التعديل (null في الإضافة)
// ============================================================
async function preparePurchase(data, user, existing = null) {
  // باركود اتكتب مكان الكمية/السعر (رقم من 7 أرقام أو أكتر) ← مفيش حفظ
  assertNoCodesInNumbers(data.items);
  const [settings, currency, warehouseId] = await Promise.all([
    getSystemSettings(),
    getBaseCurrency(),
    resolveWarehouse(data, user, existing),
  ]);
  const decimals = currency.decimals ?? 2;

  // ---------- المورد (نشط، أو نفس مورد الفاتورة في التعديل) ----------
  const supplier = await prisma.supplier.findFirst({
    where: {
      id: data.supplierId,
      ...(existing?.supplierId === data.supplierId
        ? {}
        : {
            isActive: true,
            // المورد لازم يكون متاح في فرع الفاتورة
            ...partyInBranch(existing?.branchId ?? user.branch.id),
          }),
    },
    select: { id: true, arName: true, enName: true, taxNo: true },
  });
  if (!supplier) {
    throw new AppError("SupplierNotFound", null, {
      supplierId: "SupplierNotFound",
    });
  }

  // ---------- وضع الضريبة ----------
  // مسموح لو: نفس الإعداد العام، أو نفس وضع الفاتورة (تعديل)، أو يملك الصلاحية،
  // أو "بدون ضريبة" لمورد ليس له رقم ضريبي
  const modeAllowed =
    data.taxMode === settings.purchaseTaxMode ||
    data.taxMode === existing?.taxMode ||
    can(user, "purchases.changeTaxMode") ||
    (data.taxMode === "none" && !supplier.taxNo);
  if (!modeAllowed) throw new AppError("TaxModeNotAllowed");

  // ---------- التواريخ ----------
  const now = today();
  if (data.supplierInvoiceDate > now) {
    throw new AppError("FutureDate", null, {
      supplierInvoiceDate: "FutureDate",
    });
  }
  // بدون صلاحية تغيير التاريخ: اليوم (إضافة) أو تاريخ الفاتورة كما هو (تعديل)
  const canChangeDate = can(user, "purchases.changeDate");
  const originalDay = existing ? dayOf(existing.date) : now;
  const day = canChangeDate ? (data.date ?? originalDay) : originalDay;
  if (day > now) throw new AppError("FutureDate", null, { date: "FutureDate" });
  if (day < data.supplierInvoiceDate) {
    throw new AppError("DateBeforeSupplierInvoice", null, {
      date: "DateBeforeSupplierInvoice",
    });
  }
  const date =
    existing && day === originalDay ? existing.date : dayToDateTime(day);

  // ---------- الأصناف (نشطة، أو كانت موجودة في الفاتورة قبل التعديل) ----------
  const productIds = [...new Set(data.items.map((i) => i.productId))];
  const oldIds = existing?.productIds ?? [];
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      OR: [{ isActive: true }, { id: { in: oldIds } }],
    },
    select: {
      id: true,
      code: true,
      arName: true,
      enName: true,
      taxRate: true,
      baseUnitId: true,
      serialCount: true,
      trackExpiry: true,
      productUnits: {
        select: { id: true, unitId: true, conversionFactor: true },
      },
    },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const items = data.items.map((it, i) => {
    const product = productById.get(it.productId);
    if (!product) {
      throw new AppError("ProductNotFound", null, {
        [`items.${i}.productId`]: "ProductNotFound",
      });
    }
    // الوحدة: الأساسية (معامل 1) أو وحدة إضافية للصنف
    let factor = 1;
    if (it.unitId !== product.baseUnitId) {
      const pu = product.productUnits.find((u) => u.unitId === it.unitId);
      if (!pu) {
        throw new AppError("InvalidUnit", null, {
          [`items.${i}.unitId`]: "InvalidUnit",
        });
      }
      factor = n(pu.conversionFactor);
    }
    // الصنف المتتبع بالصلاحية: دفعاته لازم تغطي كمية السطر بالظبط
    if (product.trackExpiry) {
      const sum = (it.batches ?? []).reduce((s, b) => s + n(b.qty), 0);
      if (Math.abs(sum - n(it.qty)) > 0.0005)
        throw new AppError("BatchQtyMismatch", null, {
          [`items.${i}.batches`]: "BatchQtyMismatch",
        });
    }
    return { ...it, product, factor, taxRate: n(product.taxRate) };
  });
  // دفعات كل سطر بالوحدة الأساسية (لحركات المخزون)
  const lineBatches = items.map((it) =>
    it.product.trackExpiry
      ? (it.batches ?? []).map((b) => ({
          batchNo: b.batchNo ?? null,
          mfgDate: b.mfgDate ?? null,
          expDate: b.expDate,
          qty: round(n(b.qty) * it.factor, 4),
        }))
      : null,
  );
  // الوحدة متقبلش كسور (حبة) ← الكمية لازم رقم صحيح
  await assertUnitQty(
    items.map((it) => ({
      productId: it.product.id,
      unitId: it.unitId,
      qty: it.qty,
      factor: it.factor,
    })),
  );

  // ---------- الأرقام التسلسلية (اختياري في الشراء) ----------
  const serialLines = preparePurchaseSerials(items, await serialContext()).map(
    (x, i) => ({ ...x, productId: items[i].product.id }),
  );

  // ---------- الحساب ----------
  const { lines, totals } = calcInvoice({
    items,
    taxMode: data.taxMode,
    discountType: data.discountType,
    discountValue: data.discountValue,
    decimals,
  });

  const { rows: payments, paid } = await preparePayments(
    prisma,
    data.payments,
    totals.total,
    decimals,
  );

  // بيانات الفاتورة كما تُحفظ (بدون النوع والرقم والفرع والمستخدم)
  const header = {
    warehouseId,
    supplierId: supplier.id,
    supplierArName: supplier.arName,
    supplierEnName: supplier.enName,
    supplierTaxNo: supplier.taxNo,
    supplierInvoiceNo: data.supplierInvoiceNo,
    supplierInvoiceDate: dayToDbDate(data.supplierInvoiceDate),
    date,
    taxMode: data.taxMode,
    discountType: data.discountType,
    discountValue: data.discountValue,
    subtotal: totals.subtotal,
    itemsDiscount: totals.itemsDiscount,
    invoiceDiscount: totals.invoiceDiscount,
    netAmount: totals.net,
    taxAmount: totals.tax,
    totalAmount: totals.total,
    paidAmount: paid,
    remainingAmount: round(totals.total - paid, decimals),
    notes: data.notes,
  };

  const itemRows = lines.map((l) => ({
    productId: l.product.id,
    code: l.product.code,
    arName: l.product.arName,
    enName: l.product.enName,
    note: l.note ?? null,
    unitId: l.unitId,
    factor: l.factor,
    qty: l.qty,
    baseQty: round(l.qty * l.factor, 4),
    price: l.price,
    discountType: l.discountType,
    discountValue: l.discountValue,
    itemDiscount: l.itemDiscount,
    invoiceDiscount: l.invoiceDiscount,
    taxRate: l.taxRate,
    netAmount: l.net,
    taxAmount: l.tax,
    totalAmount: l.total,
  }));

  return { header, itemRows, payments, productIds, serialLines, lineBatches };
}

// ------------------------------------------------------------
// تكلفة الصنف = المتوسط المرجّح المتحرك (cost.service) - قبل الضريبة
// بعد أي شراء أو تعديل أو حذف أو مرتجع شراء
// from: تاريخ التغيير ← فواتير البيع من التاريخ ده ورايح تكلفتها بتتصحح
// ------------------------------------------------------------
async function refreshCost(tx, productIds, from) {
  await recomputeAvgCost(tx, productIds, from ? new Date(from) : null);
}

// رقم فاتورة المورد مكرر لنفس المورد (القيد الوحيد الذي قد يتكرر هنا)
function handleDuplicateSupplierInvoice(error) {
  if (error?.code === "P2002") {
    throw new AppError("SupplierInvoiceNoExists", null, {
      supplierInvoiceNo: "SupplierInvoiceNoExists",
    });
  }
  throw error;
}

// ============================================================
// فاتورة شراء جديدة
// ============================================================
// بصمة الحفظ: نفس requestId مرتين ← نفس المستند (lib/idempotency)
export function createPurchase(data, user) {
  return saveOnce(
    "purchase",
    data.requestId,
    user,
    { id: true, number: true, docCode: true },
    () => createPurchaseNow(data, user),
  );
}

async function createPurchaseNow(data, user) {
  const { header, itemRows, payments, productIds, serialLines, lineBatches } =
    await preparePurchase(data, user);

  try {
    return await runTx(async (tx) => {
      const { number, docCode } = await nextNumber(
        tx,
        PURCHASE,
        user.branch.id,
      );
      const { items: createdItems, ...created } = await tx.purchase.create({
        data: {
          ...header,
          type: PURCHASE,
          number,
          docCode,
          branchId: user.branch.id,
          createdById: user.id,
          requestId: data.requestId ?? null,
          items: { create: itemRows },
          payments: { create: payments },
        },
        select: {
          id: true,
          number: true, docCode: true,
          items: { orderBy: { id: "asc" }, select: { id: true } },
        },
      });
      // الأرقام التسلسلية المسجلة (القطع "في المحل")
      await attachPurchaseSerials(
        tx,
        createdItems.map((x) => x.id),
        serialLines,
      );
      // البضاعة تدخل المستودع
      await applyMovements(
        tx,
        purchaseMovements({
          type: PURCHASE,
          id: created.id,
          number: created.number,
          docCode: created.docCode,
          date: header.date,
          warehouseId: header.warehouseId,
          lines: itemRows.map((r, i) => ({ ...r, batches: lineBatches[i] })),
        }),
        { allowNegative: true },
      );
      await refreshCost(tx, productIds, header.date);
      return created;
    }, TX_OPTIONS);
  } catch (error) {
    handleDuplicateSupplierInvoice(error);
  }
}

// ============================================================
// تعديل فاتورة شراء
// - ممنوع لو عليها مرتجعات (احذف المرتجعات أولاً)
// - الرقم والفرع ومن سجّلها لا تتغير، والأصناف والمدفوعات تُستبدل بالجديدة
// ============================================================
export async function updatePurchase({ id, ...data }, user) {
  const existing = await prisma.purchase.findFirst({
    where: { id, type: PURCHASE, ...branchScope(user) },
    select: {
      id: true,
      warehouseId: true,
      supplierId: true,
      taxMode: true,
      date: true,
      items: { select: { productId: true } },
    },
  });
  if (!existing) throw new AppError("PurchaseNotFound");
  const oldProductIds = existing.items.map((i) => i.productId);

  const { header, itemRows, payments, productIds, serialLines, lineBatches } =
    await preparePurchase(data, user, {
      ...existing,
      productIds: oldProductIds,
    });
  const allowNegative = await isNegativeStockAllowed();

  try {
    return await runTx(async (tx) => {
      // نتأكد داخل العملية أنه لم يُعمل مرتجع في نفس اللحظة
      const returns = await tx.purchase.count({ where: { returnOfId: id } });
      if (returns > 0) throw new AppError("PurchaseHasReturns");
      const settled = await tx.purchase.findUnique({
        where: { id },
        select: { settledAmount: true },
      });
      if (Number(settled?.settledAmount) > 0) {
        throw new AppError("InvoiceHasSettlements");
      }

      // أرقام الفاتورة قبل ما السطور تتبدل
      const oldSerials = await purchaseSerialIds(tx, id);
      const { items: newItems, ...updated } = await tx.purchase.update({
        where: { id },
        data: {
          ...header,
          items: { deleteMany: {}, create: itemRows },
          payments: { deleteMany: {}, create: payments },
        },
        select: {
          id: true,
          number: true, docCode: true,
          items: { orderBy: { id: "asc" }, select: { id: true } },
        },
      });
      const kept = await attachPurchaseSerials(
        tx,
        newItems.map((x) => x.id),
        serialLines,
        oldSerials,
      );
      await dropUnusedPurchaseSerials(tx, oldSerials, kept);
      // المخزون: نلغي حركات الفاتورة القديمة ونسجل الجديدة
      // (لو الكمية القديمة اتباعت والبيع بالسالب مقفول ← يُرفض التعديل)
      await reverseMovements(tx, "purchase", id, { allowNegative });
      await applyMovements(
        tx,
        purchaseMovements({
          type: PURCHASE,
          id,
          number: updated.number,
          docCode: updated.docCode,
          date: header.date,
          warehouseId: header.warehouseId,
          lines: itemRows.map((r, i) => ({ ...r, batches: lineBatches[i] })),
        }),
        { allowNegative },
      );
      // القديمة والجديدة (صنف اتشال من الفاتورة ترجع تكلفته لما قبلها)
      // من أقدم تاريخ (قبل التعديل أو بعده)
      const from = new Date(
        Math.min(new Date(existing.date).getTime(), new Date(header.date).getTime()),
      );
      await refreshCost(tx, [...oldProductIds, ...productIds], from);
      return updated;
    }, TX_OPTIONS);
  } catch (error) {
    if (error instanceof AppError) throw error;
    handleDuplicateSupplierInvoice(error);
  }
}

// ============================================================
// حذف فاتورة شراء (ممنوع لو عليها مرتجعات)
// ملاحظة: رقمها لا يُعاد استخدامه (يظهر فراغ في التسلسل)
// ============================================================
export async function deletePurchase(id, user) {
  const allowNegative = await isNegativeStockAllowed();
  return runTx(async (tx) => {
    const purchase = await tx.purchase.findFirst({
      where: { id, type: PURCHASE, ...branchScope(user) },
      select: {
        id: true,
        date: true,
        settledAmount: true,
        _count: { select: { returns: true } },
        items: { select: { productId: true } },
      },
    });
    if (!purchase) throw new AppError("PurchaseNotFound");
    if (purchase._count.returns > 0) throw new AppError("PurchaseHasReturns");
    if (Number(purchase.settledAmount) > 0) {
      throw new AppError("InvoiceHasSettlements");
    }

    // المخزون: البضاعة تخرج من المستودع (لو اتباعت والسالب مقفول ← يُرفض)
    await reverseMovements(tx, "purchase", id, { allowNegative });
    // الأرقام التسلسلية اللي مالهاش حركة بيع بتتمسح معاها
    const serialIds = await purchaseSerialIds(tx, id);
    // الأصناف والمدفوعات تُحذف معها (Cascade)
    await tx.purchase.delete({ where: { id } });
    await dropUnusedPurchaseSerials(tx, serialIds);
    await refreshCost(
      tx,
      purchase.items.map((i) => i.productId),
      purchase.date,
    );
    return { deleted: 1 };
  }, TX_OPTIONS);
}

// ============================================================
// حذف مرتجع مشتريات: الكميات المرتجعة ترجع متاحة في فاتورة الشراء
// ============================================================
export async function deletePurchaseReturn(id, user) {
  return runTx(async (tx) => {
    const ret = await tx.purchase.findFirst({
      where: { id, type: PURCHASE_RETURN, ...branchScope(user) },
      select: {
        id: true,
        returnOfId: true,
        date: true,
        items: { select: { qty: true, returnOfItemId: true, productId: true } },
      },
    });
    if (!ret) throw new AppError("PurchaseNotFound");
    // القطع اللي رجعت للمورد ترجع "في المحل"
    await restorePurchaseReturnSerials(tx, ret.id);

    for (const it of ret.items) {
      if (!it.returnOfItemId) continue;
      await tx.purchaseItem.update({
        where: { id: it.returnOfItemId },
        data: { returnedQty: { decrement: it.qty } },
      });
    }
    // المخزون: البضاعة المرتجعة ترجع للمستودع
    await reverseMovements(tx, "purchase", id, { allowNegative: true });
    await tx.purchase.delete({ where: { id } });
    // المتوسط: المرتجع اتلغى ← يتحسب تاني من تاريخه
    await refreshCost(
      tx,
      ret.items.map((i) => i.productId),
      ret.date,
    );
    return { deleted: 1, purchaseId: ret.returnOfId };
  }, TX_OPTIONS);
}

// بيانات فاتورة الشراء لشاشة التعديل: نفس شكل الأصناف في شاشة الإضافة
export async function getPurchaseForEdit(id, user) {
  const purchase = await getPurchase(id, PURCHASE, user);
  if (!purchase) return null;

  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(purchase.items.map((i) => i.productId))] } },
    select: pickerSelect,
  });
  const byId = new Map(products.map((p) => [p.id, toPickerProduct(p)]));
  // دفعات الفاتورة (الأصناف المتتبعة): لكل صنف، وبتتحط على أول سطر ليه
  const moves = await prisma.batchMove.findMany({
    where: { refType: "purchase", refId: id, qty: { gt: 0 } },
    select: {
      qty: true,
      batch: {
        select: { productId: true, batchNo: true, mfgDate: true, expDate: true },
      },
    },
  });
  const batchesOf = new Map();
  for (const mv of moves) {
    const list = batchesOf.get(mv.batch.productId) ?? [];
    list.push({
      batchNo: mv.batch.batchNo === "-" ? null : mv.batch.batchNo,
      mfgDate: mv.batch.mfgDate ? dbDateToDay(mv.batch.mfgDate) : null,
      expDate: mv.batch.expDate ? dbDateToDay(mv.batch.expDate) : null,
      baseQty: Number(mv.qty),
    });
    batchesOf.set(mv.batch.productId, list);
  }
  const usedBatches = new Set();

  return {
    ...purchase,
    hasReturns: (purchase.returns?.length ?? 0) > 0,
    // وحدات كل صنف (لقائمة الوحدة في الجدول)
    items: purchase.items.map((i) => ({
      ...i,
      productTaxRate: byId.get(i.productId)?.taxRate ?? i.taxRate,
      serialCount: byId.get(i.productId)?.serialCount ?? 0,
      serialLabel1: byId.get(i.productId)?.serialLabel1 ?? null,
      serialLabel2: byId.get(i.productId)?.serialLabel2 ?? null,
      trackExpiry: byId.get(i.productId)?.trackExpiry ?? false,
      // الدفعات بوحدة السطر (أول سطر للصنف ياخدها)
      batches: (() => {
        if (usedBatches.has(i.productId)) return [];
        usedBatches.add(i.productId);
        const f = Number(i.factor) || 1;
        return (batchesOf.get(i.productId) ?? []).map((b) => ({
          batchNo: b.batchNo,
          mfgDate: b.mfgDate,
          expDate: b.expDate,
          qty: Math.round((b.baseQty / f) * 1000) / 1000,
        }));
      })(),
      units: byId.get(i.productId)?.units ?? [
        { unit: i.unit, factor: i.factor, cost: 0, barcode: null },
      ],
    })),
  };
}

// ============================================================
// مرتجع مشتريات (مربوط بفاتورة شراء)
// ============================================================
// بصمة الحفظ: نفس requestId مرتين ← نفس المستند (lib/idempotency)
export function createPurchaseReturn(data, user) {
  return saveOnce(
    "purchase",
    data.requestId,
    user,
    { id: true, number: true, docCode: true },
    () => createPurchaseReturnNow(data, user),
  );
}

async function createPurchaseReturnNow(data, user) {
  const [currency, allowNegative] = await Promise.all([
    getBaseCurrency(),
    isNegativeStockAllowed(),
  ]);
  const decimals = currency.decimals ?? 2;

  const original = await prisma.purchase.findFirst({
    where: { id: data.purchaseId, type: PURCHASE, ...branchScope(user) },
    select: {
      id: true,
      warehouseId: true,
      date: true,
      supplierId: true,
      supplierArName: true,
      supplierEnName: true,
      supplierTaxNo: true,
      taxMode: true,
      items: { select: { id: true } },
    },
  });
  if (!original) throw new AppError("PurchaseNotFound");

  // ---------- التاريخ ----------
  const now = today();
  const day = can(user, "purchaseReturns.changeDate")
    ? (data.date ?? now)
    : now;
  if (day > now) throw new AppError("FutureDate", null, { date: "FutureDate" });
  if (day < dayOf(original.date)) {
    throw new AppError("DateBeforeOriginal", null, {
      date: "DateBeforeOriginal",
    });
  }

  // كل سطر مطلوب لازم يكون من نفس الفاتورة، وبدون تكرار
  const ownIds = new Set(original.items.map((i) => i.id));
  const seen = new Set();
  for (const it of data.items) {
    if (!ownIds.has(it.itemId) || seen.has(it.itemId))
      throw new AppError("ValidationError");
    seen.add(it.itemId);
  }

  return runTx(async (tx) => {
    // 1) حجز الكميات: يزيد "المرتجع" فقط لو المتاح يكفي (يقفل السطر حتى نهاية العملية)
    // ترتيب ثابت للأقفال (رقم السطر) عشان مرتجعين في نفس اللحظة ميعملوش deadlock
    for (const it of [...data.items].sort((a, b) => a.itemId - b.itemId)) {
      const line = await tx.purchaseItem.findUnique({
        where: { id: it.itemId },
        select: { qty: true, returnedQty: true },
      });
      const available = qtyMinus(line.qty, line.returnedQty);
      const { count } = await tx.purchaseItem.updateMany({
        where: {
          id: it.itemId,
          returnedQty: { lte: qtyMinus(line.qty, it.qty) },
        },
        data: { returnedQty: { increment: it.qty } },
      });
      if (count === 0 || it.qty > available) {
        throw new AppError("ReturnQtyExceeded", { available });
      }
    }

    // 2) السطور الأصلية + ما رُجّع منها قبل ذلك
    const ids = data.items.map((i) => i.itemId);
    const originals = await tx.purchaseItem.findMany({
      where: { id: { in: ids } },
    });
    const origById = new Map(originals.map((o) => [o.id, o]));
    const previous = await returnedSums(tx, ids);

    // 3) حساب كل سطر مرتجع
    const lines = data.items.map((it) => {
      const o = origById.get(it.itemId);
      const amounts = calcReturnLine(
        originalAmounts(o),
        previous.get(o.id) ?? { qty: 0 },
        it.qty,
        decimals,
      );
      return { o, ...amounts };
    });
    const totals = totalsOf(lines, decimals);
    // الوحدة متقبلش كسور ← كمية المرتجع رقم صحيح
    // (سطر قديم اتباع بكسر قبل قفل الكسور: بيرجع عادي)
    await assertUnitQty(
      lines.map((l) => ({
        productId: l.o.productId,
        unitId: l.o.unitId,
        qty: l.qty,
        factor: n(l.o.factor),
        skip: !isWholeQty(n(l.o.qty)),
      })),
      tx,
    );

    // الأرقام التسلسلية للقطع الراجعة للمورد (اختياري)
    const returnSerials = await preparePurchaseReturnSerials(
      tx,
      data.items.map((it, i) => ({
        o: lines[i].o,
        baseQty: it.qty * n(lines[i].o.factor),
        serialIds: it.serialIds,
      })),
    );

    const { rows: payments, paid } = await preparePayments(
      tx,
      data.payments,
      totals.total,
      decimals,
    );

    // 4) الحفظ
    const { number, docCode } = await nextNumber(
      tx,
      PURCHASE_RETURN,
      user.branch.id,
    );
    const date = dayToDateTime(day);
    const { items: returnItems, ...created } = await tx.purchase.create({
      data: {
        type: PURCHASE_RETURN,
        number,
        docCode,
        branchId: user.branch.id,
        // المرتجع يخرج من نفس مستودع فاتورة الشراء
        warehouseId: original.warehouseId,
        supplierId: original.supplierId,
        supplierArName: original.supplierArName,
        supplierEnName: original.supplierEnName,
        supplierTaxNo: original.supplierTaxNo,
        supplierInvoiceNo: data.supplierInvoiceNo,
        date,
        taxMode: original.taxMode,
        subtotal: totals.subtotal,
        itemsDiscount: totals.itemsDiscount,
        invoiceDiscount: totals.invoiceDiscount,
        netAmount: totals.net,
        taxAmount: totals.tax,
        totalAmount: totals.total,
        paidAmount: paid,
        remainingAmount: round(totals.total - paid, decimals),
        notes: data.notes,
        returnOfId: original.id,
        createdById: user.id,
        requestId: data.requestId ?? null,
        items: {
          create: lines.map((l) => ({
            productId: l.o.productId,
            code: l.o.code,
            arName: l.o.arName,
            enName: l.o.enName,
            // المرتجع بياخد ملاحظة السطر الأصلي زي ما هي
            note: l.o.note ?? null,
            unitId: l.o.unitId,
            factor: l.o.factor,
            qty: l.qty,
            baseQty: round(l.qty * n(l.o.factor), 4),
            price: l.o.price,
            discountType: l.o.discountType,
            discountValue: l.o.discountValue,
            itemDiscount: l.itemDiscount,
            invoiceDiscount: l.invoiceDiscount,
            taxRate: l.o.taxRate,
            netAmount: l.net,
            taxAmount: l.tax,
            totalAmount: l.total,
            returnOfItemId: l.o.id,
          })),
        },
        payments: { create: payments },
      },
      select: {
        id: true,
        number: true, docCode: true,
        items: { orderBy: { id: "asc" }, select: { id: true } },
      },
    });
    await attachPurchaseReturnSerials(
      tx,
      returnItems.map((x) => x.id),
      returnSerials,
    );

    // 5) المخزون: البضاعة المرتجعة تخرج من المستودع
    //    (لو رصيدها اتباع والبيع بالسالب مقفول ← يُرفض المرتجع)
    await applyMovements(
      tx,
      purchaseMovements({
        type: PURCHASE_RETURN,
        id: created.id,
        number,
        docCode,
        date,
        warehouseId: original.warehouseId,
        lines: lines.map((l) => ({
          productId: l.o.productId,
          baseQty: round(l.qty * n(l.o.factor), 4),
          netAmount: l.net,
        })),
        // الأصناف المتتبعة: الخروج من دفعات الفاتورة الأصلية
        batchFrom: { refType: "purchase", refId: original.id },
      }),
      { allowNegative },
    );
    // المتوسط: المرتجع بيخرج بسعر شرائه والمتوسط بيتعدل على الباقي
    await refreshCost(
      tx,
      lines.map((l) => l.o.productId),
      date,
    );
    return created;
  }, TX_OPTIONS);
}

// مبالغ السطر الأصلي بالأسماء التي يستخدمها الحساب
const originalAmounts = (o) => ({
  qty: n(o.qty),
  price: n(o.price),
  itemDiscount: n(o.itemDiscount),
  invoiceDiscount: n(o.invoiceDiscount),
  net: n(o.netAmount),
  tax: n(o.taxAmount),
  total: n(o.totalAmount),
});

// مجموع ما رُجّع من كل سطر أصلي (كمية ومبالغ)
async function returnedSums(db, itemIds) {
  if (!itemIds.length) return new Map();
  const groups = await db.purchaseItem.groupBy({
    by: ["returnOfItemId"],
    where: { returnOfItemId: { in: itemIds } },
    _sum: {
      qty: true,
      itemDiscount: true,
      invoiceDiscount: true,
      netAmount: true,
      taxAmount: true,
      totalAmount: true,
    },
  });
  return new Map(
    groups.map((g) => [
      g.returnOfItemId,
      {
        qty: n(g._sum.qty),
        itemDiscount: n(g._sum.itemDiscount),
        invoiceDiscount: n(g._sum.invoiceDiscount),
        net: n(g._sum.netAmount),
        tax: n(g._sum.taxAmount),
        total: n(g._sum.totalAmount),
      },
    ]),
  );
}

// ============================================================
// القراءة
// ============================================================

const unitSelect = {
  select: { id: true, arName: true, enName: true, allowDecimals: true },
};

// Decimal ← رقم في كل الحقول المالية
function toPurchaseDTO(p) {
  return {
    ...p,
    discountValue: n(p.discountValue),
    subtotal: n(p.subtotal),
    itemsDiscount: n(p.itemsDiscount),
    invoiceDiscount: n(p.invoiceDiscount),
    netAmount: n(p.netAmount),
    taxAmount: n(p.taxAmount),
    totalAmount: n(p.totalAmount),
    paidAmount: n(p.paidAmount),
    remainingAmount: n(p.remainingAmount),
    settledAmount: n(p.settledAmount),
    supplierInvoiceDate: dbDateToDay(p.supplierInvoiceDate),
    ...(p.items
      ? {
          items: p.items.map((i) => ({
            ...i,
            factor: n(i.factor),
            qty: n(i.qty),
            baseQty: n(i.baseQty),
            price: n(i.price),
            discountValue: n(i.discountValue),
            itemDiscount: n(i.itemDiscount),
            invoiceDiscount: n(i.invoiceDiscount),
            taxRate: n(i.taxRate),
            netAmount: n(i.netAmount),
            taxAmount: n(i.taxAmount),
            totalAmount: n(i.totalAmount),
            returnedQty: n(i.returnedQty),
          })),
        }
      : {}),
    ...(p.payments
      ? { payments: p.payments.map((x) => ({ ...x, amount: n(x.amount) })) }
      : {}),
    ...(p.returns
      ? {
          returns: p.returns.map((r) => ({
            ...r,
            totalAmount: n(r.totalAmount),
          })),
        }
      : {}),
  };
}

// قائمة الفواتير أو المرتجعات مع البحث والصفحات
// q: رقمنا أو رقم فاتورة المورد أو اسم المورد
export async function listPurchases({
  type,
  q = "",
  page = 1,
  pageSize = 20,
  user,
  branchId,
}) {
  const query = q.trim();
  // "DM-PI-15" ← فرع الرمز، و"PI-15" أو "15" ← الفرع المختار / فرع المستخدم
  const asNumber = await docNumberWhere(query, user, branchId);

  // المستخدم العادي: فواتير فرعه فقط / المدير: كل الفروع أو فرع يختاره
  const scope = branchScope(user);
  const where = {
    type,
    ...scope,
    ...(branchId && !scope.branchId ? { branchId } : {}),
    ...(query
      ? {
          OR: [
            ...(asNumber ? [asNumber] : []),
            { supplierInvoiceNo: { contains: query } },
            { supplierArName: { contains: query } },
            { supplierEnName: { contains: query } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true, docCode: true,
        date: true,
        supplierArName: true,
        supplierEnName: true,
        supplierInvoiceNo: true,
        supplierInvoiceDate: true,
        taxMode: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        settledAmount: true,
        returnOf: { select: { id: true, number: true, docCode: true } },
        // المرتجعات بس (الإشعارات مربوطة بنفس العلاقة)
        _count: { select: { returns: { where: { type: PURCHASE_RETURN } } } },
      },
    }),
  ]);

  return { total, page, pageSize, rows: rows.map(toPurchaseDTO) };
}

// فاتورة كاملة للعرض والطباعة
export async function getPurchase(id, type, user) {
  const p = await prisma.purchase.findFirst({
    where: { id, ...(type ? { type } : {}), ...branchScope(user) },
    select: {
      id: true,
      type: true,
      number: true, docCode: true,
      date: true,
      supplierId: true,
      supplierArName: true,
      supplierEnName: true,
      supplierTaxNo: true,
      supplierInvoiceNo: true,
      supplierInvoiceDate: true,
      taxMode: true,
      discountType: true,
      discountValue: true,
      subtotal: true,
      itemsDiscount: true,
      invoiceDiscount: true,
      netAmount: true,
      taxAmount: true,
      totalAmount: true,
      paidAmount: true,
      remainingAmount: true,
      settledAmount: true,
      notes: true,
      createdAt: true,
      branch: {
        select: {
          id: true,
          arName: true,
          enName: true,
          phone: true,
          registrationNo: true,
          city: true,
          district: true,
          street: true,
          buildingNo: true,
          additionalNo: true,
          postalCode: true,
        },
      },
      warehouseId: true,
      warehouse: { select: { id: true, arName: true, enName: true } },
      createdBy: { select: { arFullname: true, enFullname: true } },
      returnOf: {
        select: { id: true, number: true, docCode: true, supplierInvoiceNo: true, date: true },
      },
      // المرتجعات والإشعارات على الفاتورة (بتتفصل تحت)
      returns: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          type: true,
          number: true, docCode: true,
          date: true,
          totalAmount: true,
        },
      },
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          productId: true,
          code: true,
          arName: true,
          enName: true,
          note: true,
          unit: unitSelect,
          factor: true,
          qty: true,
          baseQty: true,
          price: true,
          discountType: true,
          discountValue: true,
          itemDiscount: true,
          invoiceDiscount: true,
          taxRate: true,
          netAmount: true,
          taxAmount: true,
          totalAmount: true,
          returnedQty: true,
          // الأرقام التسلسلية المسجلة مع الشراء / الراجعة للمورد
          serials: {
            orderBy: { id: "asc" },
            select: { id: true, serial: true, serial2: true, isUsed: true },
          },
          returnedSerials: {
            orderBy: { id: "asc" },
            select: { id: true, serial: true, serial2: true, isUsed: true },
          },
        },
      },
      payments: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          amount: true,
          reference: true,
          paymentMethodId: true,
          paymentMethod: { select: { arName: true, enName: true } },
        },
      },
    },
  });
  if (!p) return null;
  const dto = toPurchaseDTO(p);
  const linked = dto.returns ?? [];
  return {
    ...dto,
    returns: linked.filter((r) => r.type === PURCHASE_RETURN),
    // الإشعارات على الفاتورة (اسم منفصل: notes = ملاحظات الفاتورة نفسها)
    linkedNotes: linked.filter((r) => r.type !== PURCHASE_RETURN),
  };
}

// البحث عن فاتورة شراء لعمل مرتجع: برقمنا أو برقم فاتورة المورد
// يرجع قائمة مختصرة (رقم المورد قد يتكرر عند أكثر من مورد)
export async function findPurchasesForReturn({ by, value }, user) {
  let where;
  if (by === "number") {
    const ref = await docNumberWhere(value, user);
    if (!ref) return [];
    where = { type: PURCHASE, ...ref, ...branchScope(user) };
  } else {
    where = { type: PURCHASE, supplierInvoiceNo: value, ...branchScope(user) };
  }
  const rows = await prisma.purchase.findMany({
    where,
    orderBy: { id: "desc" },
    take: 20,
    select: {
      id: true,
      number: true, docCode: true,
      date: true,
      supplierArName: true,
      supplierEnName: true,
      supplierInvoiceNo: true,
      totalAmount: true,
    },
  });
  return rows.map(toPurchaseDTO);
}

// فاتورة الشراء لشاشة المرتجع: كل سطر ومعه المتاح وما رُجّع منه (كمية ومبالغ)
export async function getPurchaseForReturn(id, user) {
  const purchase = await getPurchase(id, PURCHASE, user);
  if (!purchase) return null;

  const ids = purchase.items.map((i) => i.id);
  const [previous, stockSerials] = await Promise.all([
    returnedSums(prisma, ids),
    stockSerialsByPurchaseItem(ids),
  ]);

  return {
    ...purchase,
    items: purchase.items.map((i) => ({
      ...i,
      // القطع اللي لسه في المحل (تتختار في المرتجع)
      stockSerials: stockSerials.get(i.id) ?? [],
      available: qtyMinus(i.qty, i.returnedQty),
      returned: previous.get(i.id) ?? {
        qty: 0,
        itemDiscount: 0,
        invoiceDiscount: 0,
        net: 0,
        tax: 0,
        total: 0,
      },
    })),
  };
}

// ============================================================
// بيانات شاشة فاتورة الشراء
// ============================================================

// الموردون النشطون (لاختيار المورد)
// الموردين النشطين المتاحين في فرع المستخدم
export async function getPurchaseSuppliers(user) {
  return prisma.supplier.findMany({
    where: {
      isActive: true,
      ...(user?.branch?.id ? partyInBranch(user.branch.id) : {}),
    },
    orderBy: { code: "asc" },
    select: { id: true, code: true, arName: true, enName: true, taxNo: true },
  });
}

// بيانات الصنف في شاشة الشراء: وحداته (الأساسية + الإضافية) بتكلفتها وباركودها
const pickerSelect = {
  id: true,
  code: true,
  arName: true,
  enName: true,
  cost: true,
  taxRate: true,
  // الأرقام التسلسلية (وحدة serials)
  serialCount: true,
  serialLabel1: true,
  serialLabel2: true,
  // الخدمة (مالهاش مخزون): التوالف والزيادات بترفضها
  isService: true,
  // تتبع الصلاحية: السطر بيطلب الدفعات (الانتهاء...)
  trackExpiry: true,
  // المقاسات والألوان (وحدة variants)
  ...modelFields,
  category: { select: { id: true, arName: true, enName: true } },
  baseUnit: unitSelect,
  productUnits: {
    orderBy: { id: "asc" },
    select: {
      barcode: true,
      cost: true,
      conversionFactor: true,
      unit: unitSelect,
    },
  },
};

// exactUnitId: الوحدة التي باركودها = نص البحث بالظبط (للماسح: تُضاف مباشرة)
function toPickerProduct(p, q = "") {
  const units = [
    { unit: p.baseUnit, factor: 1, cost: n(p.cost), barcode: p.code },
    ...p.productUnits.map((u) => ({
      unit: u.unit,
      factor: n(u.conversionFactor),
      cost: n(u.cost),
      barcode: u.barcode,
    })),
  ];
  const exact = q ? units.find((u) => u.barcode === q) : null;
  return {
    id: p.id,
    code: p.code,
    arName: p.arName,
    enName: p.enName,
    taxRate: n(p.taxRate),
    category: p.category,
    serialCount: p.serialCount ?? 0,
    serialLabel1: p.serialLabel1 ?? null,
    serialLabel2: p.serialLabel2 ?? null,
    isService: Boolean(p.isService),
    trackExpiry: Boolean(p.trackExpiry),
    units,
    exactUnitId: exact?.unit.id ?? null,
    modelId: p.modelId ?? null,
    size: p.size ?? null,
    color: p.color ?? null,
    colorHex: p.colorHex ?? null,
  };
}

// شرط البحث: الاسم أو الكود أو باركود أي وحدة
const productSearchWhere = (q) => ({
  OR: [
    { code: { contains: q } },
    { arName: { contains: q } },
    { enName: { contains: q } },
    { productUnits: { some: { barcode: q } } },
  ],
});

// أصناف بأرقامها بنفس شكل شاشة الاختيار (تعديل مستند محفوظ)
export async function pickerProductsByIds(ids) {
  if (!ids.length) return [];
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: pickerSelect,
  });
  return products.map((p) => toPickerProduct(p));
}

// بحث سريع أثناء الكتابة أو بالماسح (أول 20)
// models: الموديل مرة واحدة ← شبكة المقاسات بالكميات (فاتورة الشراء بس)
export async function searchPurchaseProducts(query, { models = false } = {}) {
  const q = query.trim();
  if (!q) return [];

  const products = await prisma.product.findMany({
    where: { isActive: true, ...productSearchWhere(q) },
    orderBy: { id: "desc" },
    take: 20,
    select: pickerSelect,
  });

  const rows = products.map((p) => toPickerProduct(p, q));
  return models && (await variantsEnabled())
    ? collapseModels(products, rows)
    : rows;
}

// تصفح الأصناف (نافذة الاختيار): بحث + قسم + صفحات
// بدون بحث: كل الأصناف النشطة بالترتيب الأبجدي
export async function browsePurchaseProducts(
  { q = "", categoryId, page = 1, pageSize = 20 },
  { models = false } = {},
) {
  const query = q.trim();
  const conditions = [];
  if (query) conditions.push(productSearchWhere(query));
  // القسم المختار وأقسامه الفرعية
  if (categoryId) {
    conditions.push({
      OR: [{ categoryId }, { category: { parentId: categoryId } }],
    });
  }
  const variantsOn = models && (await variantsEnabled());
  if (variantsOn) conditions.push(await modelHeadsWhere());
  const where = {
    isActive: true,
    ...(conditions.length ? { AND: conditions } : {}),
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { arName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: pickerSelect,
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    rows: products.map((p) => {
      const row = toPickerProduct(p);
      return variantsOn && p.modelId ? asModel(row, p.model) : row;
    }),
  };
}

// فاتورة الشراء: كل مقاسات الموديل (شبكة الكميات)
export async function purchaseModelVariants(modelId) {
  const [model, rows] = await Promise.all([
    prisma.productModel.findUnique({
      where: { id: modelId },
      select: { id: true, arName: true, enName: true },
    }),
    prisma.product.findMany({
      where: { modelId, isActive: true },
      orderBy: { id: "asc" },
      select: pickerSelect,
    }),
  ]);
  if (!model) throw new AppError("NotFound");
  return { model, variants: rows.map((p) => toPickerProduct(p)) };
}

// الأقسام النشطة (فلتر نافذة الأصناف)
export async function getPurchaseCategories() {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ parentId: "asc" }, { id: "asc" }],
    select: {
      id: true,
      arName: true,
      enName: true,
      parent: { select: { arName: true, enName: true } },
    },
  });
}
