import "server-only";
import { partyInBranch } from "@/lib/party-scope";
import { linkRestaurantSale } from "./restaurant-link.service";
import { assertPlanLimit } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/transaction";
import { saveOnce } from "@/lib/idempotency";
import { AppError } from "@/lib/errors";
import { assertUnitQty } from "./unit.service";
import { isWholeQty } from "@/lib/unit-qty";
import { can } from "@/lib/permissions";
import {
  calcInvoice,
  calcReturnLine,
  qtyMinus,
  round,
  totalsOf,
} from "@/lib/invoice-calc";
import { dayOf, dayToDateTime, dayToDbDate, today } from "@/lib/dates";
import { parseDocNo, saleDocNo } from "@/lib/doc-number";
import {
  applyMovements,
  isNegativeStockAllowed,
  reverseMovements,
} from "./stock.service";
import {
  getBranchSaleContext,
  saleProductSelect,
  toSaleProduct,
} from "./sale-catalog.service";
import { getBaseCurrency } from "./currency.service";
import { assertNoCodesInNumbers } from "./scan-guard.service";
import { getActivePromotions, loyaltyStatus } from "./promotion.service";
import { applyPromotions } from "@/lib/promotions";
import { EXPORT_TAX, buyerMissing, exportBuyerMissing } from "@/lib/zatca-tax";
import { isZatcaActive } from "./zatca.service";
import {
  attachReturnSerials,
  attachSaleSerials,
  prepareReturnSerials,
  prepareSaleSerials,
  releaseSaleSerials,
  restoreReturnSerials,
  serialContext,
  soldSerialsByItem,
} from "./serial.service";
import { claimPrices, linkClaimSale } from "./warranty-claim.service";
import { prepareSaleJobs } from "./technician.service";
import { nextChange, vehicleForSale } from "./vehicle.service";
import { linkBookingSale } from "./booking.service";
import {
  applyLaundryReturn,
  laundryReturnPlan,
  linkLaundrySale,
} from "./laundry-link.service";
import {
  applySaleFollowUps,
  deleteSaleFollowUps,
  prepareRenewals,
  prepareSaleFollowUps,
  resumeAfterReturnDelete,
  stopForReturn,
  syncSaleFollowUps,
} from "./follow-up.service";
import {
  assertNotProductionLive,
  assertNotSigned,
} from "./zatca-invoice.service";

// ============================================================
// المبيعات: فاتورة البيع ومرتجع البيع
// - السيرفر يعيد حساب كل المبالغ بنفسه (لا يثق في أرقام المتصفح)
// - الضريبة لكل صنف حسب شاشة الصنف (شامل / غير شامل، ونسبته)
// - السعر = قائمة أسعار الفرع أو سعر الصنف، وتغييره بصلاحية
// - البضاعة تخرج من مستودع الفرع، والمرتجع يرجّعها له
// - الكاشير: كل فاتورة على ورديته المفتوحة
// ============================================================

export const SALE = "sale";
export const SALE_RETURN = "return";

const SEQUENCE_KEY = { [SALE]: "sale", [SALE_RETURN]: "sale_return" };
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };
const n = (v) => (v == null ? 0 : Number(v));

// تكلفة الوحدة اللي اتباعت بيها (حبة / كرتونة ...): سعر التكلفة المكتوب للوحدة دي
// لو الوحدة مالهاش تكلفة: تكلفة الوحدة الأساسية × عامل التحويل
const lineUnitCost = (l) =>
  n(l.unitCost) > 0 ? n(l.unitCost) : n(l.product.cost) * n(l.factor);
const EPS = 0.0001;

// ------------------------------------------------------------
// الفروع: المستخدم يرى فواتير فرعه فقط، إلا لو يملك "عرض كل الفروع"
// ------------------------------------------------------------
export const canViewAllBranches = (user) => can(user, "allBranches.view");
const branchScope = (user) =>
  !user || canViewAllBranches(user) ? {} : { branchId: user.branch.id };

async function nextNumber(tx, type) {
  const key = SEQUENCE_KEY[type];
  const seq = await tx.documentSequence.upsert({
    where: { key },
    create: { key, last: 1 },
    update: { last: { increment: 1 } },
    select: { last: true },
  });
  return seq.last;
}

// حركات المخزون: البيع يخرج من المستودع، والمرتجع يدخل
function saleMovements({ type, id, number, date, warehouseId, lines }) {
  const sign = type === SALE ? -1 : 1;
  return lines.map((l) => ({
    productId: l.productId,
    warehouseId,
    qty: sign * n(l.baseQty),
    cost: n(l.cost),
    type: type === SALE ? "sale" : "sale_return",
    refType: "sale",
    refId: id,
    refNo: saleDocNo(type, number),
    date,
  }));
}

// ------------------------------------------------------------
// المدفوعات: طرق نشطة وليست "آجل"، ورقم العملية لو مطلوب،
// والمدفوع لا يتجاوز الإجمالي
// ------------------------------------------------------------
async function preparePayments(db, payments, total, decimals) {
  if (!payments.length) return { rows: [], paid: 0, cashPaid: 0 };
  const ids = [...new Set(payments.map((p) => p.paymentMethodId))];
  const methods = await db.paymentMethod.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, type: true, requiresReference: true },
  });
  const byId = new Map(methods.map((m) => [m.id, m]));
  let cashPaid = 0;
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
    const amount = round(p.amount, decimals);
    if (method.type === "cash") cashPaid += amount;
    return {
      paymentMethodId: p.paymentMethodId,
      amount,
      reference: p.reference ?? null,
    };
  });
  const paid = round(
    rows.reduce((s, r) => s + r.amount, 0),
    decimals,
  );
  if (paid > total + EPS) throw new AppError("PaymentExceedsTotal");
  return { rows, paid, cashPaid: round(cashPaid, decimals) };
}

// ------------------------------------------------------------
// وردية الكاشير
// - من شاشة الكاشير: لازم وردية مفتوحة على نفس الفرع
// - من الفاتورة العادية: لو عنده وردية مفتوحة تُسجل عليها (فلوسها في الدرج)
// ------------------------------------------------------------
async function resolveShift(user, required) {
  const shift = await prisma.shift.findFirst({
    where: { userId: user.id, status: "open" },
    select: { id: true, branchId: true },
  });
  if (shift && shift.branchId !== user.branch.id) {
    if (required) throw new AppError("ShiftOtherBranch");
    return null;
  }
  if (!shift && required) throw new AppError("ShiftRequired");
  return shift?.id ?? null;
}

// ============================================================
// تجهيز فاتورة بيع (إضافة وتعديل): التحقق من كل شيء وحساب المبالغ
// existing: الفاتورة الحالية في التعديل
// ============================================================
async function prepareSale(data, user, existing = null, { preview = false } = {}) {
  // باركود اتكتب مكان الكمية/السعر (رقم من 7 أرقام أو أكتر) ← مفيش حفظ
  assertNoCodesInNumbers(data.items);
  const [currency, ctx] = await Promise.all([
    getBaseCurrency(),
    getBranchSaleContext(existing?.branchId ?? user.branch.id),
  ]);
  const decimals = currency.decimals ?? 2;
  const warehouseId = existing?.warehouseId ?? ctx.warehouseId;
  if (!warehouseId) throw new AppError("WarehouseNotFound");

  // ---------- فاتورة التصدير ----------
  // (التعديل: بتفضل زي ما هي - مينفعش فاتورة تتحول من/إلى تصدير)
  const isExport = existing
    ? Boolean(existing.isExport)
    : Boolean(data.isExport);
  if (isExport && !data.customerId) {
    throw new AppError("ExportCustomerRequired", null, {
      customerId: "ExportCustomerRequired",
    });
  }

  // ---------- العميل (فاضي = عميل نقدي) ----------
  let customer = null;
  if (data.customerId) {
    customer = await prisma.customer.findFirst({
      where: {
        id: data.customerId,
        // العميل لازم يكون متاح في فرع الفاتورة
        ...(existing?.customerId === data.customerId
          ? {}
          : {
              isActive: true,
              ...partyInBranch(existing?.branchId ?? user.branch.id),
            }),
      },
      select: {
        id: true,
        arName: true,
        enName: true,
        taxNo: true,
        city: true,
        district: true,
        street: true,
        buildingNo: true,
        postalCode: true,
        countryCode: true,
        idScheme: true,
        idNumber: true,
      },
    });
    if (!customer) {
      throw new AppError("CustomerNotFound", null, {
        customerId: "CustomerNotFound",
      });
    }
    // عميل التصدير: برّه المملكة ومن غير رقم ضريبي سعودي وله عنوان
    if (isExport) {
      const exportMissing = exportBuyerMissing(customer);
      if (exportMissing.length) {
        throw new AppError(
          "ExportCustomerIncomplete",
          { missing: exportMissing },
          { customerId: "ExportCustomerIncomplete" },
        );
      }
    }
    // العميل الشركة (له رقم ضريبي أو معرّف) في فرع مربوط بالزكاة: فاتورته ضريبية
    // ولازم بياناته تكون كاملة قبل الحفظ
    const missing = isExport ? [] : buyerMissing(customer);
    if (
      missing.length &&
      (await isZatcaActive(existing?.branchId ?? user.branch.id))
    ) {
      throw new AppError(
        "CustomerB2BIncomplete",
        { missing },
        { customerId: "CustomerB2BIncomplete" },
      );
    }
  }

  // ---------- السيارة (وحدة vehicles - الورش) ----------
  const vehicle = await vehicleForSale(data.vehicleId ?? null);
  const odometer = vehicle ? (data.odometer ?? null) : null;

  // ---------- التاريخ ----------
  const now = today();
  let date;
  if (data.date && data.date !== now && can(user, "sales.changeDate")) {
    if (data.date > now) {
      throw new AppError("FutureDate", null, { date: "FutureDate" });
    }
    date =
      existing && dayOf(existing.date) === data.date
        ? existing.date
        : dayToDateTime(data.date);
  } else {
    date = existing?.date ?? new Date();
  }

  // ---------- عرض السعر (أسعاره مسموحة حتى بدون صلاحية تغيير السعر) ----------
  let quotation = null;
  if (data.quotationId) {
    quotation = await prisma.quotation.findFirst({
      where: { id: data.quotationId, ...branchScope(user) },
      select: {
        id: true,
        status: true,
        saleId: true,
        items: { select: { productId: true, unitId: true, price: true } },
      },
    });
    if (!quotation) throw new AppError("QuotationNotFound");
    if (quotation.status !== "open" && quotation.saleId !== existing?.id) {
      throw new AppError("QuotationConverted");
    }
  }
  // فاتورة طلب صيانة (قطع ومصنعية): أسعار الطلب مسموحة زي عرض السعر
  const claim =
    data.claimId && !existing ? await claimPrices(data.claimId, user) : null;
  const claimedPrice = (productId, unitId, price) =>
    claim?.items.some(
      (q) =>
        q.productId === productId &&
        q.unitId === unitId &&
        Math.abs(n(q.price) - price) < EPS,
    );
  const quotedPrice = (productId, unitId, price) =>
    quotation?.items.some(
      (q) =>
        q.productId === productId &&
        q.unitId === unitId &&
        Math.abs(n(q.price) - price) < EPS,
    );
  // فاتورة طلبات المغسلة: السعر من قائمة أسعار المغسلة وقت الاستلام
  // (laundryPrices بيحطها السيرفر من الطلبات، والشاشة ما تقدرش تبعتها:
  //  createSaleSchema بيشيل أي حقل مش معروف)
  const laundryPriced = (productId, price) =>
    data.laundryPrices?.some(
      (p) => p.productId === productId && Math.abs(p.price - price) < EPS,
    );
  // المطعم: السعر محسوب في السيرفر (الحجم + الإضافات + سعر التطبيق + الرسوم)
  // (restaurantPrices بيحطها السيرفر بس، زي laundryPrices)
  const restaurantPriced = (productId, price) =>
    data.restaurantPrices?.some(
      (p) => p.productId === productId && Math.abs(p.price - price) < EPS,
    );

  // ---------- الأصناف ----------
  const productIds = [...new Set(data.items.map((i) => i.productId))];
  const oldIds = existing?.productIds ?? [];
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      OR: [{ isActive: true }, { id: { in: oldIds } }],
    },
    select: saleProductSelect(ctx),
  });
  const productById = new Map(products.map((p) => [p.id, toSaleProduct(p)]));
  // أسعار الفاتورة القديمة (التعديل): مسموحة كما هي
  const oldPrice = new Map(
    (existing?.items ?? []).map((i) => [
      `${i.productId}:${i.unitId}`,
      n(i.price),
    ]),
  );

  const canChangePrice = can(user, "sales.changePrice");
  const items = data.items.map((it, i) => {
    const product = productById.get(it.productId);
    if (!product) {
      throw new AppError("ProductNotFound", null, {
        [`items.${i}.productId`]: "ProductNotFound",
      });
    }
    const unit = product.units.find((u) => u.unit.id === it.unitId);
    if (!unit) {
      throw new AppError("InvalidUnit", null, {
        [`items.${i}.unitId`]: "InvalidUnit",
      });
    }
    const price = round(it.price, 4);
    const allowedPrice =
      Math.abs(price - unit.price) < EPS ||
      canChangePrice ||
      quotedPrice(product.id, unit.unit.id, price) ||
      claimedPrice(product.id, unit.unit.id, price) ||
      laundryPriced(product.id, price) ||
      restaurantPriced(product.id, price) ||
      Math.abs((oldPrice.get(`${product.id}:${unit.unit.id}`) ?? -1) - price) <
        EPS;
    if (!allowedPrice) {
      throw new AppError(
        "PriceChangeNotAllowed",
        [{ arName: product.arName, enName: product.enName }],
        { [`items.${i}.price`]: "PriceChangeNotAllowed" },
      );
    }
    // فاتورة التصدير: ضريبة صفرية على كل الأصناف (بنفس السعر)
    return {
      ...it,
      price,
      product,
      factor: unit.factor,
      unitCost: unit.cost,
      taxRate: isExport ? 0 : product.taxRate,
      taxMode: isExport
        ? "exclusive"
        : product.priceIncludesTax
          ? "inclusive"
          : "exclusive",
    };
  });
  // الوحدة متقبلش كسور (حبة) ← الكمية لازم رقم صحيح
  await assertUnitQty(
    items.map((it) => ({
      productId: it.product.id,
      unitId: it.unitId,
      qty: it.qty,
      factor: it.factor,
    })),
  );

  // ---------- الأرقام التسلسلية والضمان (وحدة serials) ----------
  const serialLines = prepareSaleSerials(items, await serialContext());
  // ---------- الفني والموعد لسطور الخدمات (وحدة technicians) ----------
  const jobLines = await prepareSaleJobs(items);
  // ---------- المتابعة الدورية (وحدة followUps) ----------
  const followUpLines = await prepareSaleFollowUps(
    data.items,
    customer?.id ?? null,
  );
  // التجديد بفاتورة الصيانة: الفاتورة الجديدة بس
  const renewIds = existing
    ? []
    : await prepareRenewals(data.renewFollowUpIds, customer?.id ?? null);
  // تسجيل في سجل المتابعة بس (الميعاد زي ما هو)
  const logIds = existing
    ? []
    : (await prepareRenewals(data.logFollowUpIds, customer?.id ?? null)).filter(
        (id) => !renewIds.includes(id),
      );

  // ---------- العروض الشغالة يوم الفاتورة (السيرفر يحسبها بنفسه) ----------
  const promos = await getActivePromotions(
    existing?.branchId ?? user.branch.id,
    dayOf(date),
  );
  // عروض الولاء: مرات العميل قبل الفاتورة دي (من غير الفاتورة اللي بتتعدل)
  const loyalty = customer
    ? await loyaltyStatus(customer.id, promos, { excludeSaleId: existing?.id })
    : null;
  const applied = applyPromotions({
    items: items.map((it) => ({
      ...it,
      categoryId: it.product.categoryId,
      isService: Boolean(it.product.isService),
      // المطعم: سطور الرسوم مالهاش نصيب في خصم الفاتورة (السيرفر بس بيحددها)
      noInvoiceDiscount: Boolean(data.noDiscountProductIds?.includes(it.product.id)),
    })),
    promos,
    discountType: data.discountType,
    discountValue: data.discountValue,
    decimals,
    loyalty,
  });

  // ---------- الخصم اليدوي بصلاحية (خصم العروض لا يحتاج صلاحية) ----------
  const hasDiscount =
    (!applied.invoicePromo && n(data.discountValue) > 0) ||
    applied.items.some((l) => !l.promotionId && n(l.discountValue) > 0);
  if (hasDiscount && !can(user, "sales.discount") && !quotation && !existing) {
    throw new AppError("DiscountNotAllowed");
  }

  // ---------- الحساب ----------
  const { lines, totals } = calcInvoice({
    items: applied.items,
    taxMode: "exclusive",
    discountType: applied.discountType,
    discountValue: applied.discountValue,
    decimals,
  });

  // ---------- البيع بأقل من التكلفة ----------
  if (!can(user, "sales.belowCost")) {
    // بنقارن سعر الوحدة اللي اتباعت (بعد الخصم ومن غير ضريبة) بتكلفة نفس الوحدة
    const below = lines.filter((l) => {
      const cost = lineUnitCost(l);
      // المرة المجانية في عرض الولاء: مسموحة (العرض نفسه متحدد من الإدارة)
      if (l.loyaltyQty) return false;
      return l.qty > 0 && cost > 0 && l.net / l.qty < cost - EPS;
    });
    if (below.length) {
      throw new AppError(
        "BelowCostNotAllowed",
        below.map((l) => ({
          arName: l.product.arName,
          enName: l.product.enName,
        })),
      );
    }
  }

  // ---------- المدفوعات والآجل ----------
  const {
    rows: payments,
    paid,
    cashPaid,
  } = await preparePayments(prisma, data.payments, totals.total, decimals);
  const remaining = round(totals.total - paid, decimals);
  // المعاينة (previewSaleTotals): لسه مفيش دفع، فالآجل ما يتفحصش
  if (remaining > EPS && !preview) {
    if (!customer) throw new AppError("CustomerRequiredForCredit");
    if (!can(user, "sales.credit")) throw new AppError("CreditNotAllowed");
  }
  // الكاشير: المستلم نقداً والباقي للعميل
  const tendered = data.tenderedAmount
    ? round(Math.max(data.tenderedAmount, cashPaid), decimals)
    : cashPaid;
  const change = round(Math.max(0, tendered - cashPaid), decimals);

  const itemRows = lines.map((l, i) => {
    const baseQty = round(l.qty * l.factor, 4);
    const costAmount = round(l.qty * lineUnitCost(l), 4);
    return {
      ...jobLines[i],
      // الغيار الجاي (زيت...) لو الفاتورة على سيارة
      ...(vehicle
        ? nextChange(l.product, { odometer, date }, data.items[i].change)
        : { nextKm: null, nextDate: null }),
      warrantyMonths: serialLines[i].warrantyMonths,
      warrantyType: serialLines[i].warrantyType,
      productId: l.product.id,
      code: l.product.code,
      arName: l.product.arName,
      enName: l.product.enName,
      note: l.note ?? null,
      unitId: l.unitId,
      factor: l.factor,
      qty: l.qty,
      baseQty,
      price: l.price,
      priceIncludesTax: l.taxMode === "inclusive",
      discountType: l.discountType,
      discountValue: l.discountValue,
      itemDiscount: l.itemDiscount,
      invoiceDiscount: l.invoiceDiscount,
      taxRate: l.taxRate,
      ...(isExport
        ? {
            taxCategory: EXPORT_TAX.taxCategory,
            taxExemptionCode: EXPORT_TAX.taxExemptionCode,
            taxExemptionReason: EXPORT_TAX.taxExemptionReason,
          }
        : {
            taxCategory: l.product.taxCategory,
            taxExemptionCode: l.product.taxExemptionCode,
            taxExemptionReason: l.product.taxExemptionReason,
          }),
      netAmount: l.net,
      taxAmount: l.tax,
      totalAmount: l.total,
      // تكلفة الوحدة الأساسية (المرتجع بيحسب بيها: الكمية الأساسية × التكلفة)
      cost:
        baseQty > 0
          ? round(costAmount / baseQty, 4)
          : round(n(l.product.cost), 4),
      costAmount,
      promotionId: l.promotionId ?? null,
      loyaltyQty: l.loyaltyQty ?? null,
    };
  });

  const header = {
    warehouseId,
    customerId: customer?.id ?? null,
    customerArName: customer?.arName ?? null,
    customerEnName: customer?.enName ?? null,
    customerTaxNo: customer?.taxNo ?? null,
    vehicleId: vehicle?.id ?? null,
    vehiclePlate: vehicle?.plateNo ?? null,
    vehicleType: vehicle?.vehicleType ?? null,
    odometer,
    isExport,
    date,
    discountType: applied.discountType,
    discountValue: applied.discountValue,
    promotionId: applied.invoicePromotionId,
    subtotal: totals.subtotal,
    itemsDiscount: totals.itemsDiscount,
    invoiceDiscount: totals.invoiceDiscount,
    netAmount: totals.net,
    taxAmount: totals.tax,
    totalAmount: totals.total,
    paidAmount: paid,
    remainingAmount: remaining,
    tenderedAmount: tendered,
    changeAmount: change,
    costAmount: round(
      itemRows.reduce((s, r) => s + r.costAmount, 0),
      4,
    ),
    notes: data.notes,
  };

  return {
    header,
    itemRows,
    payments,
    quotation,
    claim,
    followUpLines,
    renewIds,
    logIds,
    serialLines: serialLines.map((x, i) => ({
      ...x,
      productId: itemRows[i].productId,
    })),
  };
}

// ============================================================
// فاتورة بيع جديدة
// ============================================================
// بصمة الحفظ: نفس requestId مرتين ← نفس المستند (lib/idempotency)
// إجمالي الفاتورة قبل الحفظ (بنفس حساب الحفظ: العروض والخصم والضريبة)
// للمغسلة: خصم مكافأة الاشتراك ومبلغ الرصيد لازم يطابقوا الفاتورة بالظبط
export async function previewSaleTotals(data, user) {
  const { header } = await prepareSale(data, user, null, { preview: true });
  return {
    total: n(header.totalAmount),
    invoiceDiscount: n(header.invoiceDiscount),
  };
}

export function createSale(data, user) {
  return saveOnce(
    "sale",
    data.requestId,
    user,
    { id: true, number: true, totalAmount: true, changeAmount: true },
    () => createSaleNow(data, user),
  );
}

async function createSaleNow(data, user) {
  // حد عدد الفواتير (الباقة)
  await assertPlanLimit("invoicesMonth", user);
  const source = data.source ?? "invoice";
  if (source === "pos" && !can(user, "sales.pos"))
    throw new AppError("Forbidden");
  const shiftId = await resolveShift(user, source === "pos");
  const {
    header,
    itemRows,
    payments,
    quotation,
    claim,
    serialLines,
    followUpLines,
    renewIds,
    logIds,
  } = await prepareSale(data, user);
  // المطعم: البيع مايقفش على الرصيد (الأكل بيتعمل وقت الطلب، والمخزون بالوصفات بعدين)
  const allowNegative =
    Boolean(data.restaurantPrices?.length) || (await isNegativeStockAllowed());

  return runTx(async (tx) => {
    const number = await nextNumber(tx, SALE);
    const { items: createdItems, ...created } = await tx.sale.create({
      data: {
        ...header,
        type: SALE,
        number,
        source,
        branchId: user.branch.id,
        shiftId,
        createdById: user.id,
        requestId: data.requestId ?? null,
        items: { create: itemRows },
        payments: { create: payments },
      },
      select: {
        id: true,
        number: true,
        totalAmount: true,
        changeAmount: true,
        items: { orderBy: { id: "asc" }, select: { id: true } },
      },
    });
    // الأرقام التسلسلية: القطع تبقى مباعة
    await attachSaleSerials(
      tx,
      createdItems.map((x) => x.id),
      serialLines,
      { customerId: header.customerId, date: header.date },
    );
    // البضاعة تخرج من مستودع الفرع
    await applyMovements(
      tx,
      saleMovements({
        type: SALE,
        id: created.id,
        number,
        date: header.date,
        warehouseId: header.warehouseId,
        lines: itemRows,
      }),
      { allowNegative },
    );
    // المتابعة الدورية: الجديدة من السطور + تجديد المختار
    await applySaleFollowUps(tx, {
      saleId: created.id,
      itemIds: createdItems.map((x) => x.id),
      lines: followUpLines,
      renewIds,
      logIds,
      customerId: header.customerId,
      branchId: user.branch.id,
      date: header.date,
      user,
    });
    // طلب الصيانة ← فاتورته
    if (claim) await linkClaimSale(tx, claim.id, created.id, user);
    // الحجز ← تم (ومربوط بالفاتورة)
    if (data.bookingId)
      await linkBookingSale(tx, data.bookingId, created.id, user);
    // طلبات المغسلة ← مربوطة بالفاتورة (والجاهز يبقى مسلَّم) + الصرف من الاشتراك
    if (data.laundryOrderIds?.length)
      await linkLaundrySale(
        tx,
        data.laundryOrderIds,
        created.id,
        user,
        data.laundryWalletUses ?? [],
      );
    // طلب المطعم ← رقمه اليومي (الجديد) أو الطاولة المفتوحة تتقفل بالفاتورة
    if (data.restaurantOrder)
      await linkRestaurantSale(tx, data.restaurantOrder, created.id, user);
    // عرض السعر ← تم تحويله لهذه الفاتورة
    if (quotation) {
      const { count } = await tx.quotation.updateMany({
        where: { id: quotation.id, status: "open" },
        data: { status: "converted", saleId: created.id },
      });
      if (!count) throw new AppError("QuotationConverted");
    }
    return created;
  }, TX_OPTIONS);
}

// الفاتورة قابلة للتعديل/الحذف؟ (بدون مرتجعات، ووردية مفتوحة لو عليها وردية)
async function assertEditable(tx, sale) {
  // اتوقّعت واتسجلت في سلسلة الزكاة: مقفولة (التصحيح بمرتجع / إشعار دائن)
  await assertNotSigned(tx, sale.id);
  // عليها سداد بسندات قبض/تسوية ← احذف السندات أولاً
  const paid = await tx.sale.findUnique({
    where: { id: sale.id },
    select: { settledAmount: true },
  });
  if (Number(paid?.settledAmount) > 0)
    throw new AppError("InvoiceHasSettlements");
  const returns = await tx.sale.count({ where: { returnOfId: sale.id } });
  if (returns > 0) throw new AppError("SaleHasReturns");
  if (sale.shiftId) {
    const shift = await tx.shift.findUnique({
      where: { id: sale.shiftId },
      select: { status: true },
    });
    if (shift?.status !== "open") throw new AppError("SaleShiftClosed");
  }
}

// ============================================================
// تعديل فاتورة بيع (ممنوع لو عليها مرتجعات أو ورديتها اتقفلت)
// ============================================================
export async function updateSale({ id, ...data }, user) {
  const existing = await prisma.sale.findFirst({
    where: { id, type: SALE, ...branchScope(user) },
    select: {
      id: true,
      branchId: true,
      warehouseId: true,
      customerId: true,
      shiftId: true,
      date: true,
      isExport: true,
      items: { select: { productId: true, unitId: true, price: true } },
      quotation: { select: { id: true } },
    },
  });
  if (!existing) throw new AppError("SaleNotFound");

  const { header, itemRows, payments, serialLines, followUpLines } =
    await prepareSale(
      { ...data, quotationId: existing.quotation?.id ?? data.quotationId },
      user,
      { ...existing, productIds: existing.items.map((i) => i.productId) },
    );
  const allowNegative = await isNegativeStockAllowed();

  return runTx(async (tx) => {
    await assertEditable(tx, existing);
    // القطع القديمة ترجع زي ما كانت قبل الفاتورة، وبعدين نسجل الجديدة
    await releaseSaleSerials(tx, id);
    const { items: newItems, ...updated } = await tx.sale.update({
      where: { id },
      data: {
        ...header,
        items: { deleteMany: {}, create: itemRows },
        payments: { deleteMany: {}, create: payments },
      },
      select: {
        id: true,
        number: true,
        items: { orderBy: { id: "asc" }, select: { id: true } },
      },
    });
    await attachSaleSerials(
      tx,
      newItems.map((x) => x.id),
      serialLines,
      { customerId: header.customerId, date: header.date },
    );
    // المتابعات اللي اتعملت بالفاتورة: تتحدث / تتعمل / تتشال
    await syncSaleFollowUps(tx, {
      saleId: id,
      itemIds: newItems.map((x) => x.id),
      lines: followUpLines,
      customerId: header.customerId,
      date: header.date,
      user,
    });
    await reverseMovements(tx, "sale", id, { allowNegative: true });
    await applyMovements(
      tx,
      saleMovements({
        type: SALE,
        id,
        number: updated.number,
        date: header.date,
        warehouseId: header.warehouseId,
        lines: itemRows,
      }),
      { allowNegative },
    );
    return updated;
  }, TX_OPTIONS);
}

// ============================================================
// حذف فاتورة بيع: البضاعة ترجع للمستودع، وعرض السعر يرجع مفتوح
// ============================================================
export async function deleteSale(id, user) {
  return runTx(async (tx) => {
    // بعد أول فاتورة اتبعتت على الإنتاج: ممنوع حذف أي فاتورة
    await assertNotProductionLive(tx);
    const sale = await tx.sale.findFirst({
      where: { id, type: SALE, ...branchScope(user) },
      select: { id: true, shiftId: true },
    });
    if (!sale) throw new AppError("SaleNotFound");
    await assertEditable(tx, sale);
    await releaseSaleSerials(tx, id);
    await deleteSaleFollowUps(tx, id);
    await reverseMovements(tx, "sale", id, { allowNegative: true });
    await tx.quotation.updateMany({
      where: { saleId: id },
      data: { status: "open", saleId: null },
    });
    await tx.sale.delete({ where: { id } });
    return { deleted: 1 };
  }, TX_OPTIONS);
}

// ============================================================
// مرتجع مبيعات (مربوط بفاتورة بيع، بدون حد للمدة)
// - السعر والضريبة من الفاتورة الأصلية
// - العميل النقدي: لازم يُرد له المبلغ كامل
// ============================================================
// بصمة الحفظ: نفس requestId مرتين ← نفس المستند (lib/idempotency)
export function createSaleReturn(data, user) {
  return saveOnce(
    "sale",
    data.requestId,
    user,
    { id: true, number: true },
    () => createSaleReturnNow(data, user),
  );
}

async function createSaleReturnNow(data, user) {
  const currency = await getBaseCurrency();
  const decimals = currency.decimals ?? 2;

  const original = await prisma.sale.findFirst({
    where: { id: data.saleId, type: SALE, ...branchScope(user) },
    select: {
      id: true,
      warehouseId: true,
      customerId: true,
      customerArName: true,
      customerEnName: true,
      customerTaxNo: true,
      isExport: true,
      date: true,
      items: { select: { id: true } },
    },
  });
  if (!original) throw new AppError("SaleNotFound");

  const ownIds = new Set(original.items.map((i) => i.id));
  const seen = new Set();
  for (const it of data.items) {
    if (!ownIds.has(it.itemId) || seen.has(it.itemId))
      throw new AppError("ValidationError");
    seen.add(it.itemId);
  }
  const shiftId = await resolveShift(user, false);

  return runTx(async (tx) => {
    // 1) حجز الكميات (لا تتجاوز المتاح)
    // ترتيب ثابت للأقفال (رقم السطر) عشان مرتجعين في نفس اللحظة ميعملوش deadlock
    for (const it of [...data.items].sort((a, b) => a.itemId - b.itemId)) {
      const line = await tx.saleItem.findUnique({
        where: { id: it.itemId },
        select: { qty: true, returnedQty: true },
      });
      const available = qtyMinus(line.qty, line.returnedQty);
      const { count } = await tx.saleItem.updateMany({
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

    // 2) حساب كل سطر من السطر الأصلي وما رُجّع منه قبل ذلك
    const ids = data.items.map((i) => i.itemId);
    const originals = await tx.saleItem.findMany({
      where: { id: { in: ids } },
    });
    const origById = new Map(originals.map((o) => [o.id, o]));
    const previous = await returnedSums(tx, ids);
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

    // الأرقام التسلسلية للقطع المرتجعة (لازم تكون مباعة بالسطر الأصلي)
    const returnSerials = await prepareReturnSerials(
      tx,
      data.items.map((it, i) => ({
        o: lines[i].o,
        baseQty: it.qty * n(lines[i].o.factor),
        returnedBaseBefore:
          (previous.get(lines[i].o.id)?.qty ?? 0) * n(lines[i].o.factor),
        serialIds: it.serialIds,
      })),
    );

    // المغسلة (laundryRefund = { methodId, subMethodId } من شاشة الاستلام):
    // نصيب الاشتراك يرجع للرصيد، والباقي بطريقة الاسترداد المختارة
    const laundryRefund = data.laundryRefund
      ? await laundryReturnPlan(tx, original.id, totals.total, decimals)
      : null;
    const refundRows = laundryRefund
      ? [
          ...(laundryRefund.value > 0
            ? [
                {
                  paymentMethodId: data.laundryRefund.subMethodId,
                  amount: laundryRefund.value,
                },
              ]
            : []),
          ...(round(totals.total - laundryRefund.value, decimals) > EPS
            ? [
                {
                  paymentMethodId: data.laundryRefund.methodId,
                  amount: round(totals.total - laundryRefund.value, decimals),
                },
              ]
            : []),
        ]
      : data.payments;
    const { rows: payments, paid } = await preparePayments(
      tx,
      refundRows,
      totals.total,
      decimals,
    );
    const remaining = round(totals.total - paid, decimals);
    if (remaining > EPS && !original.customerId) {
      throw new AppError("CashCustomerFullRefund");
    }

    const number = await nextNumber(tx, SALE_RETURN);
    // التاريخ: الآن، أو يوم سابق لمن يملك الصلاحية (ولا يسبق الفاتورة)
    const now = today();
    const day =
      data.date && can(user, "salesReturns.changeDate") ? data.date : now;
    if (day > now) {
      throw new AppError("FutureDate", null, { date: "FutureDate" });
    }
    if (day < dayOf(original.date)) {
      throw new AppError("DateBeforeOriginal", null, {
        date: "DateBeforeOriginal",
      });
    }
    const date = day === now ? new Date() : dayToDateTime(day);
    const itemRows = lines.map((l) => {
      const baseQty = round(l.qty * n(l.o.factor), 4);
      return {
        productId: l.o.productId,
        code: l.o.code,
        arName: l.o.arName,
        enName: l.o.enName,
        // المرتجع بياخد ملاحظة السطر الأصلي زي ما هي
        note: l.o.note ?? null,
        unitId: l.o.unitId,
        factor: l.o.factor,
        qty: l.qty,
        baseQty,
        price: l.o.price,
        priceIncludesTax: l.o.priceIncludesTax,
        discountType: l.o.discountType,
        discountValue: l.o.discountValue,
        itemDiscount: l.itemDiscount,
        invoiceDiscount: l.invoiceDiscount,
        taxRate: l.o.taxRate,
        taxCategory: l.o.taxCategory,
        taxExemptionCode: l.o.taxExemptionCode,
        taxExemptionReason: l.o.taxExemptionReason,
        netAmount: l.net,
        taxAmount: l.tax,
        totalAmount: l.total,
        cost: l.o.cost,
        costAmount: round(baseQty * n(l.o.cost), 4),
        returnOfItemId: l.o.id,
        warrantyMonths: l.o.warrantyMonths ?? null,
        warrantyType: l.o.warrantyType ?? null,
        // الفني (عشان المرتجع يتخصم من عمولته)
        technicianId: l.o.technicianId ?? null,
      };
    });
    const { items: returnItems, ...created } = await tx.sale.create({
      data: {
        type: SALE_RETURN,
        number,
        source: "invoice",
        branchId: user.branch.id,
        warehouseId: original.warehouseId,
        shiftId,
        customerId: original.customerId,
        customerArName: original.customerArName,
        customerEnName: original.customerEnName,
        customerTaxNo: original.customerTaxNo,
        isExport: original.isExport,
        date,
        subtotal: totals.subtotal,
        itemsDiscount: totals.itemsDiscount,
        invoiceDiscount: totals.invoiceDiscount,
        netAmount: totals.net,
        taxAmount: totals.tax,
        totalAmount: totals.total,
        paidAmount: paid,
        remainingAmount: remaining,
        tenderedAmount: paid,
        costAmount: round(
          itemRows.reduce((s, r) => s + r.costAmount, 0),
          4,
        ),
        notes: data.notes,
        returnOfId: original.id,
        createdById: user.id,
        requestId: data.requestId ?? null,
        items: { create: itemRows },
        payments: { create: payments },
      },
      select: {
        id: true,
        number: true,
        items: { orderBy: { id: "asc" }, select: { id: true } },
      },
    });
    // المغسلة: الرصيد يرجع للاشتراكات
    if (laundryRefund?.uses.length)
      await applyLaundryReturn(tx, created.id, laundryRefund.uses);
    // القطع ترجع "في المحل"
    await attachReturnSerials(
      tx,
      returnItems.map((x) => x.id),
      returnSerials,
    );
    // مرتجع كامل لسطر عليه متابعة ← المتابعة تقف
    await stopForReturn(tx, {
      returnId: created.id,
      lines: lines.map((l) => ({
        itemId: l.o.id,
        fullyReturned:
          (previous.get(l.o.id)?.qty ?? 0) + l.qty >= n(l.o.qty) - EPS,
      })),
      date,
      user,
    });
    // 3) البضاعة ترجع للمستودع
    await applyMovements(
      tx,
      saleMovements({
        type: SALE_RETURN,
        id: created.id,
        number,
        date,
        warehouseId: original.warehouseId,
        lines: itemRows,
      }),
      { allowNegative: true },
    );
    return created;
  }, TX_OPTIONS);
}

// حذف مرتجع مبيعات: الكميات ترجع متاحة في الفاتورة، والبضاعة تخرج تاني
export async function deleteSaleReturn(id, user) {
  const allowNegative = await isNegativeStockAllowed();
  return runTx(async (tx) => {
    await assertNotProductionLive(tx);
    const ret = await tx.sale.findFirst({
      where: { id, type: SALE_RETURN, ...branchScope(user) },
      select: {
        id: true,
        shiftId: true,
        returnOfId: true,
        items: { select: { qty: true, returnOfItemId: true } },
      },
    });
    if (!ret) throw new AppError("SaleNotFound");
    await assertNotSigned(tx, ret.id);
    if (ret.shiftId) {
      const shift = await tx.shift.findUnique({
        where: { id: ret.shiftId },
        select: { status: true },
      });
      if (shift?.status !== "open") throw new AppError("SaleShiftClosed");
    }
    // القطع المرتجعة ترجع مباعة (لو متباعتش تاني)
    await restoreReturnSerials(tx, ret.id);
    await resumeAfterReturnDelete(tx, ret.id);
    for (const it of ret.items) {
      if (!it.returnOfItemId) continue;
      await tx.saleItem.update({
        where: { id: it.returnOfItemId },
        data: { returnedQty: { decrement: it.qty } },
      });
    }
    await reverseMovements(tx, "sale", id, { allowNegative });
    await tx.sale.delete({ where: { id } });
    return { deleted: 1, saleId: ret.returnOfId };
  }, TX_OPTIONS);
}

const originalAmounts = (o) => ({
  qty: n(o.qty),
  price: n(o.price),
  itemDiscount: n(o.itemDiscount),
  invoiceDiscount: n(o.invoiceDiscount),
  net: n(o.netAmount),
  tax: n(o.taxAmount),
  total: n(o.totalAmount),
});

async function returnedSums(db, itemIds) {
  if (!itemIds.length) return new Map();
  const groups = await db.saleItem.groupBy({
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
const unitSelect = { select: { id: true, arName: true, enName: true } };

export async function listSales({
  type,
  q = "",
  page = 1,
  pageSize = 20,
  user,
  branchId,
}) {
  const query = q.trim();
  const asNumber = parseDocNo(query);
  const scope = branchScope(user);
  const where = {
    type,
    ...scope,
    ...(branchId && !scope.branchId ? { branchId } : {}),
    ...(query
      ? {
          OR: [
            ...(asNumber ? [{ number: asNumber }] : []),
            { customerArName: { contains: query } },
            { customerEnName: { contains: query } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        type: true,
        source: true,
        date: true,
        customerArName: true,
        customerEnName: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        settledAmount: true,
        branch: { select: { arName: true, enName: true } },
        createdBy: { select: { arFullname: true, enFullname: true } },
        returnOf: { select: { id: true, number: true } },
        // المرتجعات بس (الإشعارات مربوطة بنفس العلاقة)
        _count: { select: { returns: { where: { type: SALE_RETURN } } } },
      },
    }),
  ]);
  return { total, page, pageSize, rows };
}

const saleDetailSelect = {
  id: true,
  type: true,
  number: true,
  source: true,
  date: true,
  customerId: true,
  customerArName: true,
  customerEnName: true,
  customerTaxNo: true,
  // السيارة (وحدة vehicles)
  vehicleId: true,
  vehiclePlate: true,
  vehicleType: true,
  odometer: true,
  isExport: true,
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
  tenderedAmount: true,
  changeAmount: true,
  costAmount: true,
  notes: true,
  createdAt: true,
  shiftId: true,
  shift: { select: { id: true, number: true, status: true } },
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
  customer: {
    select: {
      id: true,
      code: true,
      phone: true,
      countryCode: true,
      idScheme: true,
      idNumber: true,
    },
  },
  // المغسلة (وحدة laundry): الطلبات + المخصوم من الاشتراك (للطباعة)
  laundryOrders: { select: { id: true, dailyNo: true, bizDay: true } },
  laundryWalletUses: { select: { credit: true } },
  // المطعم: رقم الطلب ونوعه (صالة / سفري / توصيل / تطبيق) والطاولة (للطباعة)
  restaurantOrder: {
    select: {
      dailyNo: true,
      orderType: true,
      tableNo: true,
      channelOrderNo: true,
      customerName: true,
      phone: true,
      address: true,
      channel: { select: { arName: true, enName: true } },
      driver: { select: { name: true } },
    },
  },
  returnOf: { select: { id: true, number: true, date: true } },
  // المرتجعات والإشعارات على الفاتورة (بتتفصل في getSale)
  returns: {
    orderBy: { id: "asc" },
    select: { id: true, type: true, number: true, date: true, totalAmount: true },
  },
  quotation: { select: { id: true, number: true } },
  // الفاتورة الإلكترونية (الحالة والـ QR الرسمي)
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
      createdAt: true,
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
      // وحدة التعبئة (السيراميك: الكرتونة 1.44 م²) ← الطباعة بالوحدتين
      product: {
        select: {
          baseUnit: {
            select: { arName: true, enName: true, allowDecimals: true },
          },
          productUnits: {
            where: { conversionFactor: { gt: 1 } },
            orderBy: { conversionFactor: "asc" },
            take: 1,
            select: {
              conversionFactor: true,
              unit: { select: { arName: true, enName: true } },
            },
          },
        },
      },
      price: true,
      priceIncludesTax: true,
      discountType: true,
      discountValue: true,
      itemDiscount: true,
      invoiceDiscount: true,
      taxRate: true,
      netAmount: true,
      taxAmount: true,
      totalAmount: true,
      cost: true,
      costAmount: true,
      returnedQty: true,
      // الضمان والأرقام التسلسلية (وحدة serials)
      warrantyMonths: true,
      warrantyType: true,
      // الفني والموعد (وحدة technicians)
      technicianId: true,
      technician: { select: { id: true, arName: true, enName: true } },
      jobAt: true,
      jobAddress: true,
      jobStatus: true,
      jobDoneAt: true,
      jobNote: true,
      // الغيار الجاي (زيت...) للسيارة
      nextKm: true,
      nextDate: true,
      // المتابعة الدورية اللي اتعملت بالسطر (للتعديل والعرض)
      followUps: {
        orderBy: { id: "asc" },
        take: 1,
        select: {
          id: true,
          intervalDays: true,
          place: true,
          address: true,
          locationUrl: true,
          phone: true,
          notes: true,
          status: true,
          nextDate: true,
        },
      },
      serials: {
        orderBy: { id: "asc" },
        select: {
          serialId: true,
          serialText: true,
          serial2Text: true,
          serial: { select: { isUsed: true } },
        },
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
      paymentMethod: { select: { arName: true, enName: true, type: true } },
    },
  },
};

export async function getSale(id, type, user) {
  const sale = await prisma.sale.findFirst({
    where: { id, ...(type ? { type } : {}), ...branchScope(user) },
    select: saleDetailSelect,
  });
  if (!sale) return null;
  const linked = sale.returns ?? [];
  return withPacks({
    ...sale,
    returns: linked.filter((r) => r.type === SALE_RETURN),
    // الإشعارات الدائنة والمدينة على الفاتورة
    notes: linked.filter((r) => r.type !== SALE_RETURN),
    laundry: await laundryPrintInfo(sale),
  });
}

// المغسلة: الفاتورة اتدفعت من الاشتراك ← المخصوم + رصيد العميل الحالي
// (الفاتورة العادية: null)
async function laundryPrintInfo(sale) {
  if (!sale.laundryOrders?.length && !sale.laundryWalletUses?.length)
    return null;
  const used = sale.laundryWalletUses.reduce((s, u) => s + n(u.credit), 0);
  let balance = null;
  // used سالب = مرتجع رجع للاشتراك
  if (used !== 0 && sale.customer?.id) {
    const rows = await prisma.laundryWallet.findMany({
      where: {
        customerId: sale.customer.id,
        status: "active",
        remaining: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gte: dayToDbDate(today()) } }],
      },
      select: { remaining: true },
    });
    balance = round(rows.reduce((s, r) => s + n(r.remaining), 0), 2);
  }
  return { walletUsed: round(used, 2), walletBalance: balance };
}

// تعبئة الصنف على كل سطر باسم pack (product بيتساب لشاشة التعديل)
// pack: { baseUnit: { allowDecimals }, productUnits: [{ conversionFactor, unit }] }
export const withPacks = (sale) => ({
  ...sale,
  items: sale.items.map(({ product, ...i }) => ({ ...i, pack: product })),
});

// ------------------------------------------------------------
// الكاشير: فاتورة سابقة برقمها (SI-15 أو 15) للعرض وإعادة الطباعة
// في فرع الكاشير بس
// ------------------------------------------------------------
export async function posRecentSales({ q = "" }, user) {
  const number = parseDocNo(q);
  if (!number) return [];
  const rows = await prisma.sale.findMany({
    where: { type: SALE, branchId: user.branch.id, number },
    orderBy: { id: "desc" },
    take: 5,
    select: {
      id: true,
      number: true,
      date: true,
      createdAt: true,
      customerArName: true,
      customerEnName: true,
      customer: { select: { arName: true, enName: true, phone: true } },
      totalAmount: true,
    },
  });
  return rows.map((r) => ({ ...r, totalAmount: Number(r.totalAmount) }));
}

// الكاشير: الفاتورة كاملة للعرض والطباعة (فرع الكاشير بس)
export async function posSaleForPrint(id, user) {
  const sale = await prisma.sale.findFirst({
    where: { id, type: SALE, branchId: user.branch.id },
    select: saleDetailSelect,
  });
  if (!sale) throw new AppError("SaleNotFound");
  return withPacks(sale);
}

// البحث عن فاتورة البيع للمرتجع برقمها (SI-15 أو 15)
export async function findSalesForReturn({ value }, user) {
  const number = parseDocNo(value);
  if (!number) return [];
  return prisma.sale.findMany({
    where: { type: SALE, number, ...branchScope(user) },
    take: 5,
    select: {
      id: true,
      number: true,
      date: true,
      customerArName: true,
      customerEnName: true,
      totalAmount: true,
    },
  });
}

// فاتورة البيع لشاشة المرتجع: كل سطر ومعه المتاح وما رُجّع منه
export async function getSaleForReturn(id, user) {
  const sale = await getSale(id, SALE, user);
  if (!sale) return null;
  const ids = sale.items.map((i) => i.id);
  const [previous, soldSerials] = await Promise.all([
    returnedSums(prisma, ids),
    soldSerialsByItem(ids),
  ]);
  return {
    ...sale,
    items: sale.items.map((i) => ({
      ...i,
      // القطع اللي لسه مباعة بالسطر (تتختار في المرتجع)
      soldSerials: soldSerials.get(i.id) ?? [],
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

// الفاتورة لشاشة التعديل: نفس شكل أصناف شاشة الإضافة (بوحداتها وأسعارها)
export async function getSaleForEdit(id, user) {
  const sale = await getSale(id, SALE, user);
  if (!sale) return null;
  const ctx = await getBranchSaleContext(sale.branch.id);
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(sale.items.map((i) => i.productId))] } },
    select: saleProductSelect(ctx),
  });
  const byId = new Map(products.map((p) => [p.id, toSaleProduct(p)]));
  return {
    ...sale,
    hasReturns: sale.returns.length > 0,
    items: sale.items.map((i) => ({ ...i, product: byId.get(i.productId) })),
  };
}
