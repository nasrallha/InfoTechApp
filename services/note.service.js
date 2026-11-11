import "server-only";
import { partyInBranch } from "@/lib/party-scope";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/transaction";
import { saveOnce } from "@/lib/idempotency";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { calcInvoice, round } from "@/lib/invoice-calc";
import {
  dayOf,
  dayToDateTime,
  dayToDbDate,
  dbDateToDay,
  today,
} from "@/lib/dates";
import {
  docSign,
  purchaseDocNo,
  saleDocNo,
} from "@/lib/doc-number";
import {
  customKindId,
  customKindKey,
  isCustomKind,
  noteLineAllowed,
  noteLineKind,
} from "@/lib/note-lines";
import { productTax } from "@/lib/zatca-tax";
import { getBaseCurrency } from "./currency.service";
import { getBranchSaleContext } from "./sale-catalog.service";
import { docNumberWhere, nextBranchNumber } from "./sequence.service";
import { searchPurchaseProducts } from "./purchase.service";
import {
  assertNotProductionLive,
  assertNotSigned,
} from "./zatca-invoice.service";

// ============================================================
// الإشعارات الدائنة والمدينة
// - العميل (side = sale): إشعار دائن CN (تخفيض) / مدين DN (زيادة)
//   بيتسجل في جدول المبيعات، وبيتوقّع ويتبعت للهيئة زي الفاتورة
// - المورد (side = purchase): إشعار دائن PC / مدين PD من المورد
//   بيتسجل في جدول المشتريات (تسجيل بس، من غير هيئة)
// - مفيش حركة مخزون (المرتجع الفعلي للبضاعة = شاشة المرتجع)
// - السطر: صنف (تصحيح سعر: كمية × فرق السعر) أو بند حر (خصم، رسوم شحن...)
// - الفاتورة الأصلية اختيارية، ولو مفيش لازم مرجع (billingRef) للهيئة
// - الإشعار الدائن على فاتورة ميعدّيش قيمتها الحالية
//   (الفاتورة - مرتجعاتها - الإشعارات الدائنة + الإشعارات المدينة)
// - الدائن: المبلغ يترد (طريقة دفع) أو يتخصم من الحساب
//   المدين: المبلغ يتحصّل أو يبقى على الحساب (الطرف النقدي: كامل)
// ============================================================

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };
const EPS = 0.0001;
const n = (v) => (v == null ? 0 : Number(v));

export const NOTE_SIDES = ["sale", "purchase"];

const SIDE = {
  sale: {
    model: "sale",
    invoiceType: "sale",
    partyModel: "customer",
    partyKey: "customerId",
    perm: "salesNotes",
    notFound: "SaleNotFound",
    partyNotFound: "CustomerNotFound",
    seq: { credit: "saleCredit", debit: "saleDebit" },
    docNo: saleDocNo,
  },
  purchase: {
    model: "purchase",
    invoiceType: "purchase",
    partyModel: "supplier",
    partyKey: "supplierId",
    perm: "purchaseNotes",
    notFound: "PurchaseNotFound",
    partyNotFound: "SupplierNotFound",
    seq: { credit: "purchaseCredit", debit: "purchaseDebit" },
    docNo: purchaseDocNo,
  },
};

const branchScope = (user) =>
  !user || can(user, "allBranches.view") ? {} : { branchId: user.branch.id };

// الرقم التالي في فرع الإشعار + رمز الفرع (DM-CN-5) - مفيش تكرار مهما كان عدد المستخدمين
async function nextNumber(tx, side, type, branchId) {
  return nextBranchNumber(tx, SIDE[side].seq[type], branchId);
}

// ------------------------------------------------------------
// قيمة الفاتورة الحالية = الإجمالي - المرتجعات - الدائن + المدين
// ------------------------------------------------------------
async function invoiceValue(db, side, id) {
  const S = SIDE[side];
  const [inv, groups] = await Promise.all([
    db[S.model].findUnique({ where: { id }, select: { totalAmount: true } }),
    db[S.model].groupBy({
      by: ["type"],
      where: { returnOfId: id },
      _sum: { totalAmount: true },
    }),
  ]);
  let value = n(inv?.totalAmount);
  for (const g of groups) value += docSign(g.type) * n(g._sum.totalAmount);
  return round(value, 4);
}

// ------------------------------------------------------------
// المدفوعات: طرق نشطة وليست "آجل"، ورقم العملية لو مطلوب،
// والمدفوع لا يتجاوز الإجمالي
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
  if (paid > total + EPS) throw new AppError("PaymentExceedsTotal");
  return { rows, paid };
}

// وردية الكاشير المفتوحة (فلوس الإشعار النقدية بتتحسب في درجه)
async function openShiftId(user) {
  const shift = await prisma.shift.findFirst({
    where: { userId: user.id, status: "open", branchId: user.branch.id },
    select: { id: true },
  });
  return shift?.id ?? null;
}

// ------------------------------------------------------------
// الفاتورة الأصلية (للربط): بياناتها وأصنافها وقيمتها الحالية
// ------------------------------------------------------------
const saleInvoiceSelect = {
  id: true,
  type: true,
  number: true, docCode: true,
  date: true,
  branchId: true,
  warehouseId: true,
  customerId: true,
  customerArName: true,
  customerEnName: true,
  customerTaxNo: true,
  isExport: true,
  totalAmount: true,
  items: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      productId: true,
      code: true,
      arName: true,
      enName: true,
      unitId: true,
      unit: { select: { id: true, arName: true, enName: true } },
      factor: true,
      qty: true,
      price: true,
      priceIncludesTax: true,
      taxRate: true,
      taxCategory: true,
      taxExemptionCode: true,
      totalAmount: true,
    },
  },
};

const purchaseInvoiceSelect = {
  id: true,
  type: true,
  number: true, docCode: true,
  date: true,
  branchId: true,
  warehouseId: true,
  supplierId: true,
  supplierArName: true,
  supplierEnName: true,
  supplierTaxNo: true,
  supplierInvoiceNo: true,
  taxMode: true,
  totalAmount: true,
  items: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      productId: true,
      code: true,
      arName: true,
      enName: true,
      unitId: true,
      unit: { select: { id: true, arName: true, enName: true } },
      factor: true,
      qty: true,
      price: true,
      taxRate: true,
      totalAmount: true,
    },
  },
};

const invoiceSelect = (side) =>
  side === "sale" ? saleInvoiceSelect : purchaseInvoiceSelect;

// شكل موحّد للشاشة (العميل أو المورد = party)
function toInvoice(side, inv, value) {
  const isSale = side === "sale";
  return {
    id: inv.id,
    number: inv.number,
    docNo: SIDE[side].docNo(inv.type, inv.number, inv.docCode),
    date: inv.date,
    partyId: isSale ? inv.customerId : inv.supplierId,
    partyArName: isSale ? inv.customerArName : inv.supplierArName,
    partyEnName: isSale ? inv.customerEnName : inv.supplierEnName,
    partyTaxNo: isSale ? inv.customerTaxNo : inv.supplierTaxNo,
    supplierInvoiceNo: inv.supplierInvoiceNo ?? null,
    // أسعار الفاتورة شاملة الضريبة؟ (افتراضي الإشعار)
    pricesIncludeTax: isSale
      ? inv.items.some((i) => i.priceIncludesTax)
      : inv.taxMode === "inclusive",
    totalAmount: n(inv.totalAmount),
    value,
    items: inv.items.map((i) => ({
      ...i,
      factor: n(i.factor),
      qty: n(i.qty),
      price: n(i.price),
      taxRate: n(i.taxRate),
      totalAmount: n(i.totalAmount),
    })),
  };
}

// excludeNoteId: تعديل إشعار (قيمة الفاتورة من غير الإشعار ده)
export async function getNoteInvoice(side, id, user, { excludeNoteId } = {}) {
  const S = SIDE[side];
  const inv = await prisma[S.model].findFirst({
    where: { id, type: S.invoiceType, ...branchScope(user) },
    select: invoiceSelect(side),
  });
  if (!inv) return null;
  let value = await invoiceValue(prisma, side, id);
  if (excludeNoteId) {
    const own = await prisma[S.model].findFirst({
      where: { id: excludeNoteId, returnOfId: id },
      select: { type: true, totalAmount: true },
    });
    if (own) value = round(value - docSign(own.type) * n(own.totalAmount), 4);
  }
  return toInvoice(side, inv, value);
}

// البحث عن الفاتورة برقمها (والمشتريات: برقم فاتورة المورد كمان)
export async function findNoteInvoices(side, { value }, user) {
  const S = SIDE[side];
  const ref = await docNumberWhere(value, user);
  const or = [
    ...(ref ? [ref] : []),
    ...(side === "purchase" ? [{ supplierInvoiceNo: value.trim() }] : []),
  ];
  if (!or.length) return [];
  const isSale = side === "sale";
  const rows = await prisma[S.model].findMany({
    where: { type: S.invoiceType, ...branchScope(user), OR: or },
    orderBy: { id: "desc" },
    take: 20,
    select: {
      id: true,
      type: true,
      number: true, docCode: true,
      date: true,
      totalAmount: true,
      ...(isSale
        ? { customerArName: true, customerEnName: true }
        : {
            supplierArName: true,
            supplierEnName: true,
            supplierInvoiceNo: true,
          }),
    },
  });
  return rows.map((r) => ({
    id: r.id,
    docNo: S.docNo(r.type, r.number, r.docCode),
    date: r.date,
    totalAmount: r.totalAmount,
    partyArName: isSale ? r.customerArName : r.supplierArName,
    partyEnName: isSale ? r.customerEnName : r.supplierEnName,
    supplierInvoiceNo: r.supplierInvoiceNo ?? null,
  }));
}

// بحث الأصناف (سطر تصحيح السعر)
export async function searchNoteProducts(q) {
  return searchPurchaseProducts(q);
}

// ------------------------------------------------------------
// خيارات الشاشة: الأطراف ونسبة الضريبة الافتراضية،
// والبنود المضافة من المستخدم، والأسباب اللي اتكتبت قبل كده
// ------------------------------------------------------------
export async function getNoteOptions(side, user) {
  const S = SIDE[side];
  const [parties, settings, customItems, reasons] = await Promise.all([
    prisma[S.partyModel].findMany({
      // الأطراف المتاحة في فرع المستخدم (فرع الإشعار)
      where: {
        isActive: true,
        ...(user?.branch?.id ? partyInBranch(user.branch.id) : {}),
      },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        arName: true,
        enName: true,
        phone: true,
        taxNo: true,
      },
    }),
    prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { taxRate: true, productPriceIncludesTax: true },
    }),
    listNoteLineItems(),
    listNoteReasons(),
  ]);
  return {
    parties,
    taxRate: n(settings?.taxRate ?? 15),
    pricesIncludeTax: Boolean(settings?.productPriceIncludesTax),
    customItems,
    reasons,
  };
}

// ------------------------------------------------------------
// أسباب الإشعارات (قائمة يديرها المستخدم، مشتركة بين العملاء والموردين)
// ------------------------------------------------------------
const reasonSelect = {
  id: true,
  label: true,
  enLabel: true,
  forCredit: true,
  forDebit: true,
  isActive: true,
};

export async function listNoteReasons() {
  return prisma.noteReason.findMany({
    orderBy: [{ isActive: "desc" }, { id: "asc" }],
    select: reasonSelect,
  });
}

export async function saveNoteReason({ id, ...data }) {
  try {
    return id
      ? await prisma.noteReason.update({
          where: { id },
          data,
          select: reasonSelect,
        })
      : await prisma.noteReason.create({ data, select: reasonSelect });
  } catch (error) {
    if (error?.code === "P2002")
      throw new AppError("NoteReasonExists", null, {
        label: "NoteReasonExists",
      });
    if (error?.code === "P2025") throw new AppError("NoteReasonNotFound");
    throw error;
  }
}

// الحذف مسموح دايماً (الإشعار شايل نص السبب نفسه)
export async function deleteNoteReason(id) {
  await prisma.noteReason.delete({ where: { id } }).catch((error) => {
    if (error?.code === "P2025") throw new AppError("NoteReasonNotFound");
    throw error;
  });
  return { deleted: 1 };
}

// سبب جديد مكتوب في إشعار ← يتضاف للقائمة (لنفس النوع)
async function rememberReason(label, enLabel, type) {
  const text = String(label ?? "").trim();
  if (!text) return;
  const en = String(enLabel ?? "").trim() || null;
  const found = await prisma.noteReason.findUnique({
    where: { label: text },
    select: { id: true, enLabel: true },
  });
  if (found) {
    // السبب موجود من غير إنجليزي ← ناخد الإنجليزي المكتوب في الإشعار
    if (en && !found.enLabel)
      await prisma.noteReason.update({
        where: { id: found.id },
        data: { enLabel: en },
      });
    return;
  }
  await prisma.noteReason
    .create({
      data: {
        label: text,
        enLabel: en,
        forCredit: type === "credit",
        forDebit: type === "debit",
      },
    })
    .catch(() => {}); // اتضاف في نفس اللحظة من إشعار تاني
}

// ------------------------------------------------------------
// البنود المضافة من المستخدم (مشتركة بين العملاء والموردين)
// ------------------------------------------------------------
const itemSelect = {
  id: true,
  arName: true,
  enName: true,
  forCredit: true,
  forDebit: true,
  isActive: true,
};

const toItem = (i) => ({ ...i, key: customKindKey(i.id) });

export async function listNoteLineItems() {
  const rows = await prisma.noteLineItem.findMany({
    orderBy: [{ isActive: "desc" }, { arName: "asc" }],
    select: itemSelect,
  });
  return rows.map(toItem);
}

export async function saveNoteLineItem({ id, ...data }) {
  const row = {
    ...data,
    enName: data.enName || data.arName,
  };
  try {
    const saved = id
      ? await prisma.noteLineItem.update({
          where: { id },
          data: row,
          select: itemSelect,
        })
      : await prisma.noteLineItem.create({ data: row, select: itemSelect });
    return toItem(saved);
  } catch (error) {
    if (error?.code === "P2002")
      throw new AppError("NoteItemExists", null, { arName: "NoteItemExists" });
    if (error?.code === "P2025") throw new AppError("NoteItemNotFound");
    throw error;
  }
}

// الحذف: لو البند مستخدم في إشعارات ← ممنوع (يتوقف بدل الحذف)
export async function deleteNoteLineItem(id) {
  const key = customKindKey(id);
  const [sales, purchases] = await Promise.all([
    prisma.saleItem.count({ where: { lineKind: key } }),
    prisma.purchaseItem.count({ where: { lineKind: key } }),
  ]);
  if (sales + purchases > 0) throw new AppError("NoteItemInUse");
  await prisma.noteLineItem.delete({ where: { id } }).catch((error) => {
    if (error?.code === "P2025") throw new AppError("NoteItemNotFound");
    throw error;
  });
  return { deleted: 1 };
}

// أسماء البنود المضافة المستخدمة في سطور (للعرض)
async function customKindNames(lines) {
  const ids = [
    ...new Set(lines.map((l) => customKindId(l.lineKind)).filter(Boolean)),
  ];
  if (!ids.length) return {};
  const rows = await prisma.noteLineItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, arName: true, enName: true },
  });
  return Object.fromEntries(
    rows.map((r) => [customKindKey(r.id), { ar: r.arName, en: r.enName }]),
  );
}

// ============================================================
// حفظ إشعار جديد
// ============================================================
export function createNote(side, data, user) {
  return saveOnce(
    SIDE[side].model,
    data.requestId,
    user,
    { id: true, number: true, docCode: true, type: true },
    () => createNoteNow(side, data, user),
  );
}

// ============================================================
// تعديل إشعار (بصلاحية "تعديل"): نفس النوع والرقم
// - إشعار العميل: ممنوع بعد التوقيع للهيئة (اتسجل في سلسلة الفواتير)
// - ممنوع لو عليه سندات سداد، أو ورديته اتقفلت
// ============================================================
export async function updateNote(side, { id, ...data }, user) {
  const S = SIDE[side];
  const existing = await prisma[S.model].findFirst({
    where: { id, type: { in: ["credit", "debit"] }, ...branchScope(user) },
    select: {
      id: true,
      type: true,
      number: true, docCode: true,
      date: true,
      returnOfId: true,
      totalAmount: true,
      settledAmount: true,
      ...(side === "sale" ? { shiftId: true } : {}),
    },
  });
  if (!existing) throw new AppError("NoteNotFound");
  return createNoteNow(side, { ...data, type: existing.type }, user, existing);
}

// existing: الإشعار الحالي في التعديل (غير كده إشعار جديد)
async function createNoteNow(side, data, user, existing = null) {
  const S = SIDE[side];
  const isSale = side === "sale";
  const [currency, settings] = await Promise.all([
    getBaseCurrency(),
    prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { taxRate: true },
    }),
  ]);
  const decimals = currency.decimals ?? 2;

  // ---------- الفاتورة الأصلية ----------
  const original = data.originalId
    ? await prisma[S.model].findFirst({
        where: {
          id: data.originalId,
          type: S.invoiceType,
          ...branchScope(user),
        },
        select: invoiceSelect(side),
      })
    : null;
  if (data.originalId && !original) throw new AppError(S.notFound);

  // ---------- الطرف ----------
  const partyId = original ? original[S.partyKey] : (data.partyId ?? null);
  const party = partyId
    ? await prisma[S.partyModel].findFirst({
        // من غير فاتورة: لازم يكون من أطراف الفرع (أو كل الفروع)
        where: {
          id: partyId,
          ...(original ? {} : partyInBranch(user.branch.id)),
        },
        select: { id: true, arName: true, enName: true, taxNo: true },
      })
    : null;
  if (partyId && !party) throw new AppError(S.partyNotFound);
  if (!isSale && !party) throw new AppError(S.partyNotFound);

  // ---------- المستودع (مطلوب في الجدول بس مفيش حركة مخزون) ----------
  let warehouseId = original?.warehouseId ?? null;
  if (!warehouseId) {
    const ctx = await getBranchSaleContext(user.branch.id);
    warehouseId = ctx.warehouseId;
  }
  if (!warehouseId) throw new AppError("WarehouseNotFound");

  // ---------- السطور ----------
  // نسب الضريبة المسموحة للبند الحر: نسبة البرنامج، صفر، ونسب أصناف الفاتورة
  const allowedRates = new Set([
    n(settings?.taxRate ?? 15),
    0,
    ...(original?.items ?? []).map((i) => n(i.taxRate)),
  ]);
  const productIds = [
    ...new Set(data.lines.map((l) => l.productId).filter(Boolean)),
  ];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          code: true,
          arName: true,
          enName: true,
          taxRate: true,
          taxCategory: true,
          taxExemptionCode: true,
          taxExemptionReason: true,
          baseUnitId: true,
          productUnits: { select: { unitId: true, conversionFactor: true } },
        },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));
  // ضريبة الصنف في الفاتورة الأصلية (لو موجود فيها) أولى من شاشة الصنف
  const origByProduct = new Map(
    (original?.items ?? []).map((i) => [i.productId, i]),
  );

  // البنود المضافة من المستخدم: لازم تكون موجودة وشغالة ومسموحة في النوع
  const customIds = [
    ...new Set(data.lines.map((l) => customKindId(l.kind)).filter(Boolean)),
  ];
  const customById = new Map(
    (customIds.length
      ? await prisma.noteLineItem.findMany({
          where: { id: { in: customIds }, isActive: true },
          select: { id: true, forCredit: true, forDebit: true },
        })
      : []
    ).map((c) => [c.id, c]),
  );
  const allowed = (key) => {
    if (!isCustomKind(key)) return noteLineAllowed(data.type, key);
    const c = customById.get(customKindId(key));
    return Boolean(c && (data.type === "credit" ? c.forCredit : c.forDebit));
  };

  const mode = data.pricesIncludeTax ? "inclusive" : "exclusive";
  const draft = data.lines.map((l, i) => {
    if (!allowed(l.kind))
      throw new AppError("ValidationError", null, {
        [`lines.${i}.kind`]: "ValidationError",
      });
    if (noteLineKind(l.kind)?.product) {
      const p = productById.get(l.productId);
      if (!p)
        throw new AppError("ProductNotFound", null, {
          [`lines.${i}.productId`]: "ProductNotFound",
        });
      const factor =
        l.unitId === p.baseUnitId
          ? 1
          : n(
              p.productUnits.find((u) => u.unitId === l.unitId)
                ?.conversionFactor,
            );
      if (!(factor > 0))
        throw new AppError("ValidationError", null, {
          [`lines.${i}.unitId`]: "ValidationError",
        });
      const o = origByProduct.get(p.id);
      const tax = productTax(
        o
          ? {
              taxRate: o.taxRate,
              taxCategory: o.taxCategory,
              taxExemptionCode: o.taxExemptionCode,
            }
          : p,
      );
      return {
        lineKind: l.kind,
        productId: p.id,
        code: p.code,
        arName: p.arName,
        enName: p.enName,
        note: l.description || null,
        unitId: l.unitId,
        factor,
        qty: l.qty,
        price: l.price,
        taxRate: n(o ? o.taxRate : p.taxRate),
        ...tax,
        taxMode: mode,
      };
    }
    // بند حر
    const rate = n(l.taxRate);
    if (!allowedRates.has(rate))
      throw new AppError("ValidationError", null, {
        [`lines.${i}.taxRate`]: "ValidationError",
      });
    const tax = productTax({
      taxRate: rate,
      taxCategory: l.taxCategory,
      taxExemptionCode: l.taxExemptionCode,
    });
    return {
      lineKind: l.kind,
      productId: null,
      code: "",
      arName: l.description,
      enName: l.descriptionEn || l.description,
      note: null,
      unitId: null,
      factor: 1,
      qty: 1,
      price: l.price,
      taxRate: rate,
      ...tax,
      taxMode: mode,
    };
  });
  const { lines, totals } = calcInvoice({ items: draft, decimals });
  if (!(totals.total > 0)) throw new AppError("NoItems");

  // ---------- التاريخ: الآن (أو تاريخ الإشعار في التعديل)، أو يوم سابق بالصلاحية ----------
  const now = today();
  const keep = existing ? dayOf(existing.date) : now;
  const day = data.date && can(user, `${S.perm}.changeDate`) ? data.date : keep;
  if (day > now) throw new AppError("FutureDate", null, { date: "FutureDate" });
  if (original && day < dayOf(original.date))
    throw new AppError("DateBeforeOriginal", null, {
      date: "DateBeforeOriginal",
    });
  const date = existing
    ? day === keep
      ? existing.date
      : dayToDateTime(day)
    : day === now
      ? new Date()
      : dayToDateTime(day);
  const shiftId = isSale
    ? existing
      ? (existing.shiftId ?? null)
      : await openShiftId(user)
    : null;

  const saved = await runTx(async (tx) => {
    // التعديل: مسموح قبل التوقيع للهيئة، ومن غير سداد، والوردية مفتوحة
    if (existing) {
      if (isSale) await assertNotSigned(tx, existing.id);
      const fresh = await tx[S.model].findUnique({
        where: { id: existing.id },
        select: { settledAmount: true },
      });
      if (n(fresh?.settledAmount) > 0)
        throw new AppError("InvoiceHasSettlements");
      if (existing.shiftId) {
        const shift = await tx.shift.findUnique({
          where: { id: existing.shiftId },
          select: { status: true },
        });
        if (shift?.status !== "open") throw new AppError("SaleShiftClosed");
      }
    }
    // الإشعار الدائن ميعدّيش قيمة الفاتورة (قفل على الفاتورة عشان إشعارين في نفس اللحظة)
    if (original) {
      if (isSale)
        await tx.$queryRaw`SELECT id FROM sales WHERE id = ${original.id} FOR UPDATE`;
      else
        await tx.$queryRaw`SELECT id FROM purchases WHERE id = ${original.id} FOR UPDATE`;
      if (data.type === "credit") {
        // التعديل: قيمة الفاتورة من غير الإشعار ده نفسه
        const own =
          existing?.returnOfId === original.id ? n(existing.totalAmount) : 0;
        const value = round(
          (await invoiceValue(tx, side, original.id)) + own,
          4,
        );
        if (totals.total > value + EPS)
          throw new AppError("NoteExceedsInvoice", { available: value });
      }
    }

    const { rows: payments, paid } = await preparePayments(
      tx,
      data.payments,
      totals.total,
      decimals,
    );
    const remaining = round(totals.total - paid, decimals);
    if (remaining > EPS && !party)
      throw new AppError(
        data.type === "credit"
          ? "CashCustomerFullRefund"
          : "CashCustomerFullPay",
      );

    const { number, docCode } = existing
      ? { number: existing.number, docCode: existing.docCode ?? null }
      : await nextNumber(tx, side, data.type, user.branch.id);
    const itemRows = lines.map((l) => ({
      lineKind: l.lineKind,
      productId: l.productId,
      code: l.code,
      arName: l.arName,
      enName: l.enName,
      note: l.note,
      unitId: l.unitId,
      factor: l.factor,
      qty: l.qty,
      baseQty: l.productId ? round(l.qty * l.factor, 4) : 0,
      price: l.price,
      discountType: "amount",
      discountValue: 0,
      itemDiscount: 0,
      invoiceDiscount: 0,
      taxRate: l.taxRate,
      netAmount: l.net,
      taxAmount: l.tax,
      totalAmount: l.total,
      ...(isSale
        ? {
            priceIncludesTax: mode === "inclusive",
            taxCategory: l.taxCategory,
            taxExemptionCode: l.taxExemptionCode,
            taxExemptionReason: l.taxExemptionReason,
          }
        : {}),
    }));

    // التعديل: السطور والمدفوعات القديمة بتتشال وتتكتب من جديد
    if (existing) {
      if (isSale) {
        await tx.saleItem.deleteMany({ where: { saleId: existing.id } });
        await tx.salePayment.deleteMany({ where: { saleId: existing.id } });
      } else {
        await tx.purchaseItem.deleteMany({
          where: { purchaseId: existing.id },
        });
        await tx.purchasePayment.deleteMany({
          where: { purchaseId: existing.id },
        });
      }
    }

    const common = {
      type: data.type,
      number,
      docCode,
      ...(existing ? {} : { branchId: user.branch.id }),
      warehouseId,
      date,
      subtotal: totals.subtotal,
      itemsDiscount: 0,
      invoiceDiscount: 0,
      netAmount: totals.net,
      taxAmount: totals.tax,
      totalAmount: totals.total,
      paidAmount: paid,
      remainingAmount: remaining,
      notes: data.notes ?? null,
      noteReason: data.reason,
      noteReasonEn: data.reasonEn ?? null,
      billingRef: original ? null : (data.billingRef ?? null),
      returnOfId: original?.id ?? null,
      ...(existing
        ? {}
        : { createdById: user.id, requestId: data.requestId ?? null }),
      items: { create: itemRows },
      payments: { create: payments },
    };

    const write = (model, payload) =>
      existing
        ? tx[model].update({
            where: { id: existing.id },
            data: payload,
            select: { id: true, number: true, docCode: true, type: true },
          })
        : tx[model].create({
            data: payload,
            select: { id: true, number: true, docCode: true, type: true },
          });
    const created = isSale
      ? await write("sale", {
          ...common,
          source: "invoice",
          shiftId,
          customerId: party?.id ?? null,
          customerArName: original?.customerArName ?? party?.arName ?? null,
          customerEnName: original?.customerEnName ?? party?.enName ?? null,
          customerTaxNo: original?.customerTaxNo ?? party?.taxNo ?? null,
          isExport: Boolean(original?.isExport),
          tenderedAmount: paid,
        })
      : await write("purchase", {
          ...common,
          supplierId: party.id,
          supplierArName: original?.supplierArName ?? party.arName,
          supplierEnName: original?.supplierEnName ?? party.enName,
          supplierTaxNo: original?.supplierTaxNo ?? party.taxNo ?? null,
          supplierInvoiceNo: data.supplierNoteNo ?? null,
          supplierInvoiceDate: data.supplierNoteDate
            ? dayToDbDate(data.supplierNoteDate)
            : null,
          taxMode: mode,
        });
    return created;
  }, TX_OPTIONS).catch((error) => {
    // رقم إشعار المورد اتسجل قبل كده لنفس المورد
    if (
      error?.code === "P2002" &&
      String(error?.meta?.target ?? "").includes("supplierInvoiceNo")
    )
      throw new AppError("DuplicateSupplierNote", null, {
        supplierNoteNo: "DuplicateSupplierNote",
      });
    throw error;
  });
  // السبب الجديد يتضاف لقائمة الأسباب
  await rememberReason(data.reason, data.reasonEn, data.type);
  return saved;
}

// ============================================================
// حذف إشعار
// - العميل: ممنوع بعد التوقيع للهيئة أو بعد الإرسال على الإنتاج،
//   ولو ورديته اتقفلت
// - المدين اللي عليه سندات سداد: احذف السندات الأول
// ============================================================
export async function deleteNote(side, id, user) {
  const S = SIDE[side];
  const isSale = side === "sale";
  return runTx(async (tx) => {
    if (isSale) await assertNotProductionLive(tx);
    const note = await tx[S.model].findFirst({
      where: { id, type: { in: ["credit", "debit"] }, ...branchScope(user) },
      select: {
        id: true,
        settledAmount: true,
        returnOfId: true,
        ...(isSale ? { shiftId: true } : {}),
      },
    });
    if (!note) throw new AppError("NoteNotFound");
    if (isSale) await assertNotSigned(tx, note.id);
    if (n(note.settledAmount) > 0) throw new AppError("InvoiceHasSettlements");
    if (note.shiftId) {
      const shift = await tx.shift.findUnique({
        where: { id: note.shiftId },
        select: { status: true },
      });
      if (shift?.status !== "open") throw new AppError("SaleShiftClosed");
    }
    await tx[S.model].delete({ where: { id } });
    return { deleted: 1, originalId: note.returnOfId };
  }, TX_OPTIONS);
}

// ============================================================
// القراءة
// ============================================================
export async function listNotes(
  side,
  { type, q = "", page = 1, pageSize = 20, branchId },
  user,
) {
  const S = SIDE[side];
  const isSale = side === "sale";
  const query = q.trim();
  const asNumber = await docNumberWhere(query, user, branchId);
  const scope = branchScope(user);
  const where = {
    type: type ?? { in: ["credit", "debit"] },
    ...scope,
    ...(branchId && !scope.branchId ? { branchId } : {}),
    ...(query
      ? {
          OR: [
            ...(asNumber ? [asNumber] : []),
            ...(isSale
              ? [
                  { customerArName: { contains: query } },
                  { customerEnName: { contains: query } },
                ]
              : [
                  { supplierArName: { contains: query } },
                  { supplierEnName: { contains: query } },
                  { supplierInvoiceNo: query },
                ]),
            { billingRef: { contains: query } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma[S.model].count({ where }),
    prisma[S.model].findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        type: true,
        number: true, docCode: true,
        date: true,
        ...(isSale
          ? { customerArName: true, customerEnName: true }
          : {
              supplierArName: true,
              supplierEnName: true,
              supplierInvoiceNo: true,
            }),
        noteReason: true,
        noteReasonEn: true,
        billingRef: true,
        totalAmount: true,
        taxAmount: true,
        branch: { select: { arName: true, enName: true } },
        createdBy: { select: { arFullname: true, enFullname: true } },
        returnOf: { select: { id: true, type: true, number: true, docCode: true } },
        ...(isSale
          ? { zatcaDocument: { select: { status: true, kind: true } } }
          : {}),
      },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    rows: rows.map((r) => ({
      ...r,
      partyArName: isSale ? r.customerArName : r.supplierArName,
      partyEnName: isSale ? r.customerEnName : r.supplierEnName,
    })),
  };
}

const unitSelect = { select: { id: true, arName: true, enName: true } };

const noteItemSelect = (isSale) => ({
  orderBy: { id: "asc" },
  select: {
    id: true,
    lineKind: true,
    productId: true,
    code: true,
    arName: true,
    enName: true,
    note: true,
    unit: unitSelect,
    factor: true,
    qty: true,
    price: true,
    discountType: true,
    discountValue: true,
    itemDiscount: true,
    invoiceDiscount: true,
    taxRate: true,
    netAmount: true,
    taxAmount: true,
    totalAmount: true,
    ...(isSale ? { priceIncludesTax: true, taxCategory: true } : {}),
  },
});

const partyAddress = {
  arName: true,
  enName: true,
  taxNo: true,
  phone: true,
  city: true,
  district: true,
  street: true,
  buildingNo: true,
  additionalNo: true,
  postalCode: true,
};

export async function getNote(side, id, user) {
  const S = SIDE[side];
  const isSale = side === "sale";
  const doc = await prisma[S.model].findFirst({
    where: { id, type: { in: ["credit", "debit"] }, ...branchScope(user) },
    select: {
      id: true,
      type: true,
      number: true, docCode: true,
      date: true,
      noteReason: true,
      noteReasonEn: true,
      billingRef: true,
      notes: true,
      subtotal: true,
      itemsDiscount: true,
      invoiceDiscount: true,
      netAmount: true,
      taxAmount: true,
      totalAmount: true,
      paidAmount: true,
      remainingAmount: true,
      settledAmount: true,
      createdAt: true,
      branch: {
        select: {
          id: true,
          arName: true,
          enName: true,
          phone: true,
          idScheme: true,
          registrationNo: true,
          city: true,
          district: true,
          street: true,
          buildingNo: true,
          additionalNo: true,
          postalCode: true,
        },
      },
      createdBy: { select: { arFullname: true, enFullname: true } },
      returnOf: {
        select: {
          id: true,
          type: true,
          number: true, docCode: true,
          date: true,
          ...(isSale ? {} : { supplierInvoiceNo: true }),
        },
      },
      items: noteItemSelect(isSale),
      payments: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          amount: true,
          reference: true,
          paymentMethod: { select: { arName: true, enName: true, type: true } },
        },
      },
      ...(isSale
        ? {
            customerId: true,
            customerArName: true,
            customerEnName: true,
            customerTaxNo: true,
            isExport: true,
            tenderedAmount: true,
            changeAmount: true,
            customer: { select: { id: true, ...partyAddress } },
            shift: { select: { id: true, number: true, docCode: true, status: true } },
            zatcaDocument: {
              select: {
                status: true,
                kind: true,
                docType: true,
                environment: true,
                icv: true,
                uuid: true,
                qr: true,
                zatcaStatus: true,
                warnings: true,
                errors: true,
                attempts: true,
                acceptedAt: true,
              },
            },
          }
        : {
            supplierId: true,
            supplierArName: true,
            supplierEnName: true,
            supplierTaxNo: true,
            supplierInvoiceNo: true,
            supplierInvoiceDate: true,
            taxMode: true,
            supplier: { select: { id: true, ...partyAddress } },
          }),
    },
  });
  if (!doc) return null;
  return {
    ...doc,
    // أسماء البنود المضافة من المستخدم في السطور
    kindNames: await customKindNames(doc.items),
    side,
    docNo: S.docNo(doc.type, doc.number, doc.docCode),
    supplierInvoiceDate: doc.supplierInvoiceDate
      ? dbDateToDay(doc.supplierInvoiceDate)
      : null,
  };
}

// ------------------------------------------------------------
// بيانات شاشة التعديل: الإشعار بشكل الفورم (+ أصناف السطور بوحداتها)
// null = مش موجود / مقفول (اتوقّع للهيئة أو عليه سداد أو ورديته اتقفلت)
// ------------------------------------------------------------
export async function getNoteForEdit(side, id, user) {
  const S = SIDE[side];
  const isSale = side === "sale";
  const doc = await prisma[S.model].findFirst({
    where: { id, type: { in: ["credit", "debit"] }, ...branchScope(user) },
    select: {
      id: true,
      type: true,
      number: true, docCode: true,
      date: true,
      returnOfId: true,
      billingRef: true,
      noteReason: true,
      noteReasonEn: true,
      notes: true,
      settledAmount: true,
      [S.partyKey]: true,
      items: {
        orderBy: { id: "asc" },
        select: {
          lineKind: true,
          productId: true,
          unitId: true,
          arName: true,
          enName: true,
          note: true,
          qty: true,
          price: true,
          taxRate: true,
          ...(isSale
            ? {
                priceIncludesTax: true,
                taxCategory: true,
                taxExemptionCode: true,
              }
            : {}),
        },
      },
      payments: {
        orderBy: { id: "asc" },
        select: { paymentMethodId: true, amount: true, reference: true },
      },
      ...(isSale
        ? {
            shift: { select: { status: true } },
            zatcaDocument: { select: { id: true } },
          }
        : {
            taxMode: true,
            supplierInvoiceNo: true,
            supplierInvoiceDate: true,
          }),
    },
  });
  if (!doc) return null;
  const locked =
    n(doc.settledAmount) > 0 ||
    (isSale &&
      (Boolean(doc.zatcaDocument) ||
        (doc.shift && doc.shift.status !== "open")));

  // أصناف سطور تصحيح السعر بوحداتها (للاختيار في الفورم)
  const productIds = [
    ...new Set(doc.items.map((i) => i.productId).filter(Boolean)),
  ];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          code: true,
          arName: true,
          enName: true,
          taxRate: true,
          baseUnit: { select: { id: true, arName: true, enName: true } },
          productUnits: {
            orderBy: { id: "asc" },
            select: {
              conversionFactor: true,
              unit: { select: { id: true, arName: true, enName: true } },
            },
          },
        },
      })
    : [];
  const productById = new Map(
    products.map((p) => [
      p.id,
      {
        key: `p${p.id}`,
        id: p.id,
        code: p.code,
        arName: p.arName,
        enName: p.enName,
        taxRate: n(p.taxRate),
        units: [
          { unit: p.baseUnit, factor: 1 },
          ...p.productUnits.map((u) => ({
            unit: u.unit,
            factor: n(u.conversionFactor),
          })),
        ],
      },
    ]),
  );

  return {
    id: doc.id,
    type: doc.type,
    docNo: S.docNo(doc.type, doc.number, doc.docCode),
    locked,
    day: dayOf(doc.date),
    originalId: doc.returnOfId,
    partyId: doc[S.partyKey] ?? null,
    billingRef: doc.billingRef ?? "",
    reason: doc.noteReason ?? "",
    reasonEn: doc.noteReasonEn ?? "",
    notes: doc.notes ?? "",
    pricesIncludeTax: isSale
      ? doc.items.some((i) => i.priceIncludesTax)
      : doc.taxMode === "inclusive",
    supplierNoteNo: doc.supplierInvoiceNo ?? "",
    supplierNoteDate: doc.supplierInvoiceDate
      ? dbDateToDay(doc.supplierInvoiceDate)
      : null,
    lines: doc.items.map((i) => {
      const rate = n(i.taxRate);
      const category = rate > 0 ? "S" : i.taxCategory || "O";
      const product = i.productId ? productById.get(i.productId) : null;
      return {
        kind: i.lineKind ?? "other",
        product: product ? { ...product, taxRate: rate } : null,
        unitId: i.unitId ?? null,
        qty: n(i.qty),
        price: n(i.price),
        // الصنف: الوصف = ملاحظة السطر / البند الحر: الاسم
        description: i.productId ? (i.note ?? "") : i.arName,
        descriptionEn: i.productId ? "" : i.enName,
        tax: `${rate}|${category}|${(rate > 0 ? null : i.taxExemptionCode) ?? ""}`,
      };
    }),
    payments: doc.payments.map((p) => ({
      paymentMethodId: p.paymentMethodId,
      amount: n(p.amount),
      reference: p.reference ?? undefined,
    })),
  };
}
