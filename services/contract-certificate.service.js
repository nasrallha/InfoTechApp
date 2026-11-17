import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { assertModule, hasModule } from "@/lib/modules";
import { dayToDbDate, formatDay, today } from "@/lib/dates";
import { productTax } from "@/lib/zatca-tax";
import { calcInvoice, round } from "@/lib/invoice-calc";
import { advanceBalance, certLineAmount, certificateCalc, certificateDocNo, itemAmount } from "@/lib/contracting";
import { createSaleReturnSchema, createSaleSchema, updateSaleSchema } from "@/validations/sale.schema";
import { createPurchaseReturnSchema, createPurchaseSchema, updatePurchaseSchema } from "@/validations/purchase.schema";
import { findOrCreate } from "./product.service";
import { createSale, createSaleReturn, deleteSale, updateSale } from "./sale.service";
import { createPurchase, createPurchaseReturn, deletePurchase, updatePurchase } from "./purchase.service";
import { afterSaleSaved, assertNotProductionLive } from "./zatca-invoice.service";
import { createVoucher, deleteVoucher } from "./voucher.service";
import { getBaseCurrency } from "./currency.service";
import { getSystemSettings } from "./system-settings.service";
import { partyBranchWhere } from "@/lib/party-scope";
import { formatDocNo } from "@/lib/doc-number";
import { MODULE, contractDocNo, day, n } from "./contracting.service";
import { nextBranchNumber } from "./sequence.service";

// ============================================================
// فواتير المقاولات
// - عقد المالك (owner) ← فواتير بيع (الزكاة وكشف حساب العميل) / عقد الباطن (sub) ← فواتير شراء
// - الدفعة المقدمة: فاتورة بسطر «دفعة مقدمة» (قبل الضريبة × نسبة الضريبة)
// - المستخلص: سطر لكل بند منفّذ (الكمية 1 × قيمة السطر، واسم السطر = وصف البند)
//   واسترداد الدفعة المقدمة = خصم على الفاتورة (الضريبة على الصافي بس)
//   ← مجموع ضريبة المستخلصات + الدفعة المقدمة = ضريبة العقد بالظبط
// - حجز الضمان: مش بيقلل الفاتورة، بيفضل على الطرف لحد الإفراج (سند قبض / صرف)
// - غرامة التأخير: سند تسوية على الطرف (خارج نطاق الضريبة)
// - التحصيل / السداد: سند قبض (المالك) أو صرف (مقاول الباطن) مربوط بالعقد
// - الفاتورة على فرع العقد، والسعر من العقد (صلاحية «فواتير العقود» هي اللي بتحكم)
// ============================================================

// صنف الخدمة (بيتعمل أول مرة): أعمال المقاولات / الدفعة المقدمة - لكل نسبة ضريبة
const PRODUCTS = {
  work: { code: "CT-WORK", arName: "أعمال مقاولات", enName: "Contracting works" },
  advance: { code: "CT-ADV", arName: "دفعة مقدمة", enName: "Advance payment" },
};

async function contractProduct(type, taxRate) {
  const def = PRODUCTS[type];
  const code = `${def.code}-${Number(taxRate)}`;
  const select = { id: true, baseUnitId: true, taxRate: true };
  const found = await prisma.product.findUnique({ where: { code }, select });
  if (found) return found;
  const [unitId, categoryId] = await Promise.all([
    findOrCreate("unit", "خدمة", "Service"),
    findOrCreate("category", "خدمات", "Services"),
  ]);
  try {
    return await prisma.product.create({
      data: {
        code,
        arName: def.arName,
        enName: def.enName,
        categoryId,
        baseUnitId: unitId,
        isService: true,
        cost: 0,
        price: 0,
        taxRate,
        isPriceIncludeTax: false,
        ...productTax({ taxRate, taxCategory: taxRate > 0 ? "S" : "O" }),
      },
      select,
    });
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    return prisma.product.findUnique({ where: { code }, select });
  }
}

// المستخدم على فرع العقد + صلاحيات الفاتورة (السعر والآجل والخصم من العقد)
const actingUser = (user, branchId) => ({
  ...user,
  branch: { ...user.branch, id: branchId },
  permissions: [
    ...(user.permissions ?? []),
    "sales.create",
    "sales.update",
    "sales.changePrice",
    "sales.credit",
    "sales.discount",
    "sales.belowCost",
    "purchases.create",
    "purchases.update",
    "purchases.changeTaxMode",
    "salesReturns.create",
    "purchaseReturns.create",
    "receipts.create",
    "receipts.delete",
    "paymentVouchers.create",
    "paymentVouchers.delete",
    "settlements.create",
    "settlements.delete",
  ],
});

async function decimalsOf() {
  return (await getBaseCurrency())?.decimals ?? 2;
}

// العقد بالفرع (مدير النظام من أي فرع)
async function loadContract(id, user, select) {
  const c = await prisma.constructionContract.findUnique({
    where: { id },
    select: { id: true, branchId: true, ...select },
  });
  if (!c || (!can(user, "allBranches.view") && c.branchId !== user.branch.id))
    throw new AppError("ContractNotFound");
  return c;
}

// أسماء سطور الفاتورة = وصف البنود (قبل التوقيع للزكاة)
async function renameLines(model, field, docId, names) {
  const rows = await prisma[model].findMany({
    where: { [field]: docId },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  await prisma.$transaction(
    rows.map((r, i) =>
      prisma[model].update({
        where: { id: r.id },
        data: { arName: names[i].slice(0, 150), enName: names[i].slice(0, 150) },
      }),
    ),
  );
}

// وحدة السطر في الفاتورة: الوحدة المختارة (متر مربع / متر مكعب ...) بتتضاف لصنف المقاولات
// كوحدة إضافية (معامل 1) أول مرة، عشان الفاتورة تقبلها
async function lineUnit(product, unitId) {
  if (!unitId || unitId === product.baseUnitId) return product.baseUnitId;
  const found = await prisma.productUnit.findUnique({
    where: { productId_unitId: { productId: product.id, unitId } },
    select: { id: true },
  });
  if (!found) {
    try {
      await prisma.productUnit.create({ data: { productId: product.id, unitId, conversionFactor: 1 } });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
    }
  }
  return unitId;
}

// فاتورة (بيع / شراء) لسطور بمبالغ + خصم (الاسترداد)
// lines: [{ name, amount, note, unitId?, qty?, price? }] | payments: السداد على الفاتورة (فاضي = آجل)
//   unitId: السطر بالكمية والوحدة والسعر (120 م² × 50) بدل «1 خدمة × المبلغ»
// docId: تعديل فاتورة موجودة بنفس رقمها (فاتورة الدفعة المقدمة)
async function createDoc(c, user, { lines, productType, discount = 0, notes, supplierInvoiceNo, payments = [], docId = null }) {
  const product = await contractProduct(productType, n(c.taxRate));
  const items = [];
  for (const l of lines) {
    const byUnit = Boolean(l.unitId);
    items.push({
      productId: product.id,
      unitId: await lineUnit(product, l.unitId),
      qty: byUnit ? l.qty : 1,
      price: byUnit ? l.price : l.amount,
      discountType: "amount",
      discountValue: 0,
      note: l.note ? l.note.slice(0, 500) : null,
    });
  }
  const acting = actingUser(user, c.branchId);
  if (c.kind === "sub") {
    const data = {
      supplierId: c.supplierId,
      supplierInvoiceNo,
      supplierInvoiceDate: today(),
      taxMode: "exclusive",
      discountType: "amount",
      discountValue: discount,
      notes: notes.slice(0, 500),
      items,
      payments,
    };
    const saved = docId
      ? await updatePurchase(updatePurchaseSchema.parse({ ...data, id: docId }), acting)
      : await createPurchase(createPurchaseSchema.parse(data), acting);
    const id = docId ?? saved.id;
    await renameLines("purchaseItem", "purchaseId", id, lines.map((l) => l.name));
    return { purchaseId: id };
  }
  const data = {
    source: "invoice",
    customerId: c.customerId,
    discountType: "amount",
    discountValue: discount,
    notes: notes.slice(0, 500),
    items,
    payments,
  };
  const saved = docId
    ? await updateSale(updateSaleSchema.parse({ ...data, id: docId }), acting)
    : await createSale(createSaleSchema.parse(data), acting);
  const id = docId ?? saved.id;
  await renameLines("saleItem", "saleId", id, lines.map((l) => l.name));
  return { saleId: id };
}

// حذف فاتورة العقد (نفس قيود الحذف العادية: الزكاة / السندات / المرتجعات)
async function dropDoc(c, user, { saleId, purchaseId }) {
  const acting = actingUser(user, c.branchId);
  if (saleId) await deleteSale(saleId, acting);
  if (purchaseId) await deletePurchase(purchaseId, acting);
}

// ------------------------------------------------------------
// فاتورة الدفعة المقدمة + السداد عليها (زي فواتير دفعات الإيجار)
// payment: { paymentMethodId, reference, paidAmount }
//   - من غير طريقة دفع ← آجل على الطرف (يتحصّل بسند من شاشة العقد)
//   - paidAmount فاضي ← مدفوعة بالكامل | أقل من الإجمالي ← جزئي والباقي آجل
// ------------------------------------------------------------
const ADVANCE_SELECT = {
  kind: true,
  number: true,
  docCode: true,
  status: true,
  customerId: true,
  supplierId: true,
  taxRate: true,
  projectName: true,
  totalAmount: true,
  advancePct: true,
  advanceAmount: true,
  advanceSaleId: true,
  advancePurchaseId: true,
};

// إجمالي فاتورة الدفعة شامل الضريبة (نفس حساب الفاتورة) + السداد عليها
async function advancePayments(c, amount, payment) {
  const decimals = await decimalsOf();
  const { totals } = calcInvoice({
    items: [{ qty: 1, price: amount, taxRate: n(c.taxRate) }],
    taxMode: "exclusive",
    decimals,
  });
  if (!payment?.paymentMethodId) return [];
  const paid = payment.paidAmount;
  if (paid != null && paid > totals.total + 1e-9)
    throw new AppError("PaidOverTotal", null, { paidAmount: "PaidOverTotal" });
  return [
    {
      paymentMethodId: payment.paymentMethodId,
      amount: paid != null && paid > 0 ? round(paid, decimals) : totals.total,
      reference: payment.reference ?? null,
    },
  ];
}

const advanceLine = (c, amount, pct) => ({
  name: `دفعة مقدمة${pct ? ` ${Number(pct)}%` : ""} - ${c.projectName}`,
  amount,
  note: `عقد ${contractDocNo(c)}`,
});

export async function issueAdvance({ contractId, supplierInvoiceNo, ...payment }, user) {
  await assertModule(MODULE);
  const c = await loadContract(contractId, user, ADVANCE_SELECT);
  if (c.status !== "active") throw new AppError("ContractNotActive");
  if (!(n(c.advanceAmount) > 0)) throw new AppError("ContractNoAdvance");
  if (c.advanceSaleId || c.advancePurchaseId) throw new AppError("AdvanceIssued");
  const docNo = contractDocNo(c);
  const doc = await createDoc(c, user, {
    productType: "advance",
    lines: [advanceLine(c, n(c.advanceAmount), c.advancePct)],
    notes: `دفعة مقدمة - عقد ${docNo} - ${c.projectName}`,
    supplierInvoiceNo: supplierInvoiceNo || `${docNo}-ADV`,
    payments: await advancePayments(c, n(c.advanceAmount), payment),
  });
  // تسجيل الفاتورة على العقد (لو اتسجلت فاتورة تانية في نفس اللحظة: الجديدة بتتلغي)
  const saved = await prisma.constructionContract.updateMany({
    where: { id: c.id, advanceSaleId: null, advancePurchaseId: null },
    data: { advanceSaleId: doc.saleId ?? null, advancePurchaseId: doc.purchaseId ?? null },
  });
  if (!saved.count) {
    await dropDoc(c, user, doc).catch(() => {});
    throw new AppError("AdvanceIssued");
  }
  const zatca = doc.saleId ? await afterSaleSaved(doc.saleId, {}).catch(() => null) : null;
  return { ...doc, zatca };
}

// ------------------------------------------------------------
// تعديل فاتورة الدفعة المقدمة بنفس رقمها (القيمة + السداد) - صلاحية constructionContracts.editInvoice
// - نفس قيود تعديل الفاتورة: الموقّعة للزكاة أو اللي عليها سندات مقفولة (التصحيح بإشعار)
// - القيمة الجديدة مش أقل من اللي اتسترد منها في المستخلصات
// - قيمة الدفعة المقدمة في العقد بتتعدل معاها (والنسبة من قيمة العقد)
// ------------------------------------------------------------
export async function updateAdvance({ contractId, supplierInvoiceNo, amount, ...payment }, user) {
  await assertModule(MODULE);
  const decimals = await decimalsOf();
  const c = await loadContract(contractId, user, {
    ...ADVANCE_SELECT,
    certificates: { where: { cancelled: false }, select: { recovery: true } },
  });
  const docId = c.advanceSaleId ?? c.advancePurchaseId;
  if (!docId) throw new AppError("NotFound");
  const value = round(amount ?? n(c.advanceAmount), decimals);
  const recovered = c.certificates.reduce((s, x) => s + n(x.recovery), 0);
  if (value + 1e-9 < recovered)
    throw new AppError("AdvanceBelowRecovered", { recovered: round(recovered, decimals) }, { amount: "AdvanceBelowRecovered" });
  const total = n(c.totalAmount);
  const pct = total > 0 ? round((value / total) * 100, 4) : n(c.advancePct);
  const docNo = contractDocNo(c);
  const doc = await createDoc(c, user, {
    productType: "advance",
    lines: [advanceLine(c, value, pct)],
    notes: `دفعة مقدمة - عقد ${docNo} - ${c.projectName}`,
    supplierInvoiceNo: supplierInvoiceNo || `${docNo}-ADV`,
    payments: await advancePayments(c, value, payment),
    docId,
  });
  if (value !== n(c.advanceAmount))
    await prisma.constructionContract.update({
      where: { id: c.id },
      data: { advanceAmount: value, advancePct: pct },
    });
  const zatca = doc.saleId ? await afterSaleSaved(doc.saleId, {}).catch(() => null) : null;
  return { ...doc, zatca };
}

// حذف فاتورة الدفعة المقدمة (قبل أي استرداد منها في مستخلص)
export async function cancelAdvance(contractId, user) {
  await assertModule(MODULE);
  const c = await loadContract(contractId, user, {
    kind: true,
    advanceSaleId: true,
    advancePurchaseId: true,
    certificates: { where: { recovery: { gt: 0 }, cancelled: false }, select: { id: true }, take: 1 },
  });
  if (!c.advanceSaleId && !c.advancePurchaseId) throw new AppError("NotFound");
  if (c.certificates.length) throw new AppError("AdvanceRecovered");
  await dropDoc(c, user, { saleId: c.advanceSaleId, purchaseId: c.advancePurchaseId });
  await prisma.constructionContract.update({
    where: { id: c.id },
    data: { advanceSaleId: null, advancePurchaseId: null },
  });
  return { id: c.id };
}

// ------------------------------------------------------------
// المستخلص
// ------------------------------------------------------------
export async function createCertificate(data, user) {
  await assertModule(MODULE);
  const decimals = await decimalsOf();
  const c = await loadContract(data.contractId, user, {
    kind: true,
    number: true,
    docCode: true,
    status: true,
    customerId: true,
    supplierId: true,
    projectName: true,
    taxRate: true,
    isDirect: true,
    advanceAmount: true,
    priorAdvance: true,
    recoveryPct: true,
    retentionPct: true,
    advanceSaleId: true,
    advancePurchaseId: true,
    items: {
      select: {
        id: true,
        itemNo: true,
        description: true,
        unitName: true,
        qty: true,
        price: true,
        amount: true,
        certLines: { where: { certificate: { cancelled: false } }, select: { qty: true, amount: true } },
      },
    },
    certificates: {
      orderBy: { seq: "desc" },
      select: { seq: true, isFinal: true, recovery: true, cancelled: true },
    },
  });
  if (c.status !== "active") throw new AppError("ContractNotActive");
  if (c.certificates.some((x) => x.isFinal && !x.cancelled)) throw new AppError("ContractFinalized");
  if (data.date > today()) throw new AppError("FutureDate", null, { date: "FutureDate" });
  // عقد من غير مقايسة: المستخلص ببنود حرة أو مبلغ إجمالي
  if (!c.items.length && data.mode === "qty") data = { ...data, mode: "lump" };

  // ---------- السطور ----------
  const byId = new Map(c.items.map((it) => [it.id, it]));
  // الوحدات المختارة للبنود الحرة (من الوحدات المتسجلة)
  const unitIds = [...new Set(data.lines.map((l) => l.unitId).filter(Boolean))];
  const unitById = new Map(
    (unitIds.length
      ? await prisma.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, arName: true } })
      : []
    ).map((u) => [u.id, u]),
  );
  const used = new Set();
  const lines = [];
  for (const l of data.lines) {
    if (!(l.qty > 0)) continue;
    if (l.itemId && data.mode === "qty") {
      const it = byId.get(l.itemId);
      if (!it || used.has(it.id)) throw new AppError("ContractItemNotFound");
      used.add(it.id);
      const prevQty = round(it.certLines.reduce((s, x) => s + n(x.qty), 0), 3);
      const prevAmount = round(it.certLines.reduce((s, x) => s + n(x.amount), 0), decimals);
      if (round(prevQty + l.qty, 3) > round(n(it.qty), 3) + 1e-9)
        throw new AppError("CertQtyOverContract", { item: it.description.slice(0, 80) });
      const amount = certLineAmount(
        { qty: n(it.qty), price: n(it.price), amount: n(it.amount) },
        l.qty,
        prevQty,
        prevAmount,
        decimals,
      );
      lines.push({
        itemId: it.id,
        description: it.description,
        unitName: it.unitName,
        qty: l.qty,
        price: n(it.price),
        amount,
        itemNo: it.itemNo,
      });
    } else {
      // بند حر (أعمال إضافية) أو المبلغ الإجمالي - بالوحدة المختارة (لو فيه)
      const unit = l.unitId ? unitById.get(l.unitId) : null;
      if (l.unitId && !unit) throw new AppError("InvalidUnit");
      lines.push({
        itemId: null,
        description: l.description,
        unitName: unit ? unit.arName : l.unitName,
        unitId: unit ? unit.id : null,
        qty: l.qty,
        price: l.price,
        amount: itemAmount(l.qty, l.price, decimals),
        itemNo: null,
      });
    }
  }
  const valued = lines.filter((l) => l.amount > 0);
  if (!valued.length) throw new AppError("CertNoWorks");

  // ---------- الحساب ----------
  const advanceIssued = Boolean(c.advanceSaleId || c.advancePurchaseId);
  const recovered = c.certificates.filter((x) => !x.cancelled).reduce((s, x) => s + n(x.recovery), 0);
  // المستخلص السريع: الاسترداد زي ما المستخدم كتبه (مفيش متابعة دفعة مقدمة)، بحد أقصى الأعمال
  const advanceLeft = c.isDirect
    ? round(valued.reduce((s, l) => s + l.amount, 0), decimals)
    : advanceBalance({
        advanceIssued,
        advanceAmount: c.advanceAmount,
        priorAdvance: c.priorAdvance,
        recovered,
        decimals,
      });
  // الاسترداد المكتوب أكبر من باقي الدفعة المقدمة ← الضريبة هتقل غلط
  if (!c.isDirect && data.recovery != null && data.recovery > advanceLeft + 1e-9)
    throw new AppError("RecoveryOverAdvance", { left: advanceLeft }, { recovery: "RecoveryOverAdvance" });
  const calc = certificateCalc({
    amounts: valued.map((l) => l.amount),
    contract: { recoveryPct: n(c.recoveryPct), retentionPct: n(c.retentionPct), taxRate: n(c.taxRate) },
    advanceLeft,
    isFinal: data.isFinal,
    recovery: data.recovery,
    retention: data.retention,
    penalty: data.penalty,
    decimals,
  });
  if (calc.net < 0) throw new AppError("CertNetNegative");

  // السداد على الفاتورة: الصافي المستحق كله (مدفوع بالكامل) أو جزء منه، والباقي آجل
  // (بحد أقصى الصافي: الضمان بيفضل على الفاتورة لحد الإفراج، والغرامة بسند تسوية)
  if (data.paymentMethodId && data.paidAmount != null && data.paidAmount > calc.net + 1e-9)
    throw new AppError("PaidOverNet", { net: calc.net }, { paidAmount: "PaidOverNet" });
  const payAmount = data.paymentMethodId
    ? round(data.paidAmount != null && data.paidAmount > 0 ? data.paidAmount : calc.net, decimals)
    : 0;
  const payments =
    payAmount > 0
      ? [{ paymentMethodId: data.paymentMethodId, amount: payAmount, reference: data.reference ?? null }]
      : [];

  const seq = (c.certificates[0]?.seq ?? 0) + 1;
  const docNo = contractDocNo(c);
  // ملاحظة الفاتورة: العقد والمشروع / المستخلص السريع برقمه عند العميل
  const ref = data.clientRef ? ` - رقم العميل ${data.clientRef}` : "";
  const period =
    data.periodFrom && data.periodTo
      ? ` (${formatDay(data.periodFrom)} - ${formatDay(data.periodTo)})`
      : "";
  // ملاحظة الفاتورة برقم المستخلص (الرقم بيتحجز مع حفظ المستخلص، فبتتحدث بعدها)
  const noteOf = (certNo) =>
    (c.isDirect
      ? `مستخلص رقم ${certNo}${ref}${period}`
      : `مستخلص رقم ${certNo}${data.isFinal ? " (ختامي)" : ""} - عقد ${docNo} - ${c.projectName}${ref}${period}`
    ).slice(0, 500);

  // ---------- الفاتورة ----------
  const doc = await createDoc(c, user, {
    productType: "work",
    lines: valued.map((l) => ({
      name: `${l.itemNo ? `${l.itemNo} - ` : ""}${l.description}`,
      amount: l.amount,
      // بالوحدة المختارة: الكمية والسعر في الفاتورة نفسها
      unitId: l.unitId ?? null,
      qty: l.qty,
      price: l.price,
      note:
        !l.unitId && (l.itemId || l.qty !== 1)
          ? `${Number(l.qty)} ${l.unitName ?? ""} × ${Number(l.price)}`.trim()
          : null,
    })),
    discount: calc.recovery,
    payments,
    notes: noteOf(c.isDirect ? "" : seq),
    supplierInvoiceNo: data.supplierInvoiceNo || `${docNo}-${seq}`,
  });

  let penaltyVoucherId = null;
  let certificateId = null;
  let certDocNo = null;
  try {
    // الإجمالي الفعلي من الفاتورة (نفس الحساب، بس من المصدر)
    const saved = doc.saleId
      ? await prisma.sale.findUnique({ where: { id: doc.saleId }, select: { taxAmount: true, totalAmount: true } })
      : await prisma.purchase.findUnique({ where: { id: doc.purchaseId }, select: { taxAmount: true, totalAmount: true } });
    const invoiceTotal = n(saved.totalAmount);
    const taxAmount = n(saved.taxAmount);

    // غرامة التأخير: سند تسوية على الطرف
    if (calc.penalty > 0) {
      const v = await createVoucher(
        {
          type: "settlement",
          partyType: c.kind === "sub" ? "supplier" : "customer",
          customerId: c.kind === "sub" ? null : c.customerId,
          supplierId: c.kind === "sub" ? c.supplierId : null,
          amount: calc.penalty,
          notes: `غرامة تأخير - مستخلص رقم ${seq} - عقد ${docNo}`,
        },
        actingUser(user, c.branchId),
      );
      penaltyVoucherId = v.id;
    }

    certificateId = await prisma.$transaction(async (tx) => {
      // رقم المستخلص: مسلسل واحد لكل المستخلصات في الفرع (عقود + سريعة)
      const no = await nextBranchNumber(tx, "constructionCertificate", c.branchId);
      certDocNo = formatDocNo("constructionCertificate", no.number, no.docCode);
      const created = await tx.constructionCertificate.create({
        data: {
          contractId: c.id,
          seq,
          branchId: c.branchId,
          number: no.number,
          docCode: no.docCode,
          date: dayToDbDate(data.date),
          periodFrom: data.periodFrom ? dayToDbDate(data.periodFrom) : null,
          periodTo: data.periodTo ? dayToDbDate(data.periodTo) : null,
          mode: data.mode,
          isFinal: data.isFinal,
          gross: calc.gross,
          recovery: calc.recovery,
          taxRate: n(c.taxRate),
          taxAmount,
          invoiceTotal,
          retention: calc.retention,
          penalty: calc.penalty,
          netPayable: round(invoiceTotal - calc.retention - calc.penalty, decimals),
          clientRef: data.clientRef ?? null,
          saleId: doc.saleId ?? null,
          purchaseId: doc.purchaseId ?? null,
          penaltyVoucherId,
          notes: data.notes,
          createdById: user.id,
          certLines: {
            create: lines.map((l) => ({
              itemId: l.itemId,
              description: l.description,
              unitName: l.unitName,
              qty: l.qty,
              price: l.price,
              amount: l.amount,
            })),
          },
        },
        select: { id: true },
      });
      // ملاحظة الفاتورة برقم المستخلص (قبل التوقيع للزكاة)
      if (doc.saleId) await tx.sale.update({ where: { id: doc.saleId }, data: { notes: noteOf(certDocNo) } });
      else await tx.purchase.update({ where: { id: doc.purchaseId }, data: { notes: noteOf(certDocNo) } });
      // الختامي: العقد بيبقى «منتهي»
      if (data.isFinal)
        await tx.constructionContract.update({ where: { id: c.id }, data: { status: "completed" } });
      return created.id;
    }, { timeout: 20_000, maxWait: 10_000 });
  } catch (error) {
    // المستخلص متسجلش (مثلاً اتسجل مستخلص بنفس الرقم في نفس اللحظة) ← الفاتورة والسند يتلغوا
    if (penaltyVoucherId)
      await deleteVoucher(penaltyVoucherId, actingUser(user, c.branchId)).catch(() => {});
    await dropDoc(c, user, doc).catch(() => {});
    if (error?.code === "P2002") throw new AppError("CertificateConflict");
    throw error;
  }
  const zatca = doc.saleId ? await afterSaleSaved(doc.saleId, {}).catch(() => null) : null;
  return { id: certificateId, seq, docNo: certDocNo, ...doc, zatca };
}

// ------------------------------------------------------------
// فاتورة البيع / الشراء دي تبع المقاولات؟ (شاشة تعديل الفاتورة بتحوّل لتعديل المستخلص / العقد)
// ← { certId } مستخلص | { contractId } فاتورة الدفعة المقدمة | null فاتورة عادية
// ------------------------------------------------------------
export async function contractingDocOf({ saleId = null, purchaseId = null }) {
  if (!(await hasModule(MODULE))) return null;
  const by = saleId ? { saleId } : { purchaseId };
  const cert = await prisma.constructionCertificate.findFirst({ where: by, select: { id: true } });
  if (cert) return { certId: cert.id };
  const contract = await prisma.constructionContract.findFirst({
    where: saleId ? { advanceSaleId: saleId } : { advancePurchaseId: purchaseId },
    select: { id: true },
  });
  return contract ? { contractId: contract.id } : null;
}

// ------------------------------------------------------------
// تعديل المستخلص وفاتورته بنفس رقمها (صلاحية «تعديل فاتورة الدفعة»)
// - نفس قيود تعديل الفاتورة: الموقّعة للزكاة أو اللي عليها سندات مقفولة (التصحيح بمرتجع / إشعار)
// - المستخلص بالكميات (بنود العقد): السطور زي ما هي، والتعديل في الاسترداد والضمان والسداد
// - المستخلص بالمبلغ الإجمالي / السريع: البنود كمان
// - الاسترداد (عقد): مش أكبر من باقي الدفعة المقدمة (من غير استرداد المستخلص ده نفسه)
// ------------------------------------------------------------
export async function updateCertificate(data, user) {
  await assertModule(MODULE);
  const decimals = await decimalsOf();
  const x = await prisma.constructionCertificate.findUnique({
    where: { id: data.id },
    select: {
      id: true,
      seq: true,
      number: true,
      docCode: true,
      mode: true,
      cancelled: true,
      penalty: true,
      saleId: true,
      purchaseId: true,
      sale: { select: { notes: true } },
      purchase: { select: { notes: true, supplierInvoiceNo: true } },
      certLines: {
        orderBy: { id: "asc" },
        select: { itemId: true, description: true, unitName: true, qty: true, price: true, amount: true, item: { select: { itemNo: true } } },
      },
      contract: {
        select: {
          id: true,
          kind: true,
          number: true,
          docCode: true,
          branchId: true,
          customerId: true,
          supplierId: true,
          taxRate: true,
          isDirect: true,
          advanceAmount: true,
          priorAdvance: true,
          advanceSaleId: true,
          advancePurchaseId: true,
          certificates: { where: { cancelled: false }, select: { id: true, recovery: true } },
        },
      },
    },
  });
  if (!x || (!can(user, "allBranches.view") && x.contract.branchId !== user.branch.id))
    throw new AppError("NotFound");
  if (x.cancelled) throw new AppError("CertCancelled");
  const c = x.contract;
  const docId = x.saleId ?? x.purchaseId;
  if (!docId) throw new AppError("NotFound");

  // ---------- السطور ----------
  const qtyMode = x.certLines.some((l) => l.itemId);
  let lines;
  if (qtyMode || !data.lines?.length) {
    lines = x.certLines.map((l) => ({
      itemId: l.itemId,
      description: l.description,
      unitName: l.unitName,
      unitId: null,
      qty: n(l.qty),
      price: n(l.price),
      amount: n(l.amount),
      itemNo: l.item?.itemNo ?? null,
    }));
  } else {
    const unitIds = [...new Set(data.lines.map((l) => l.unitId).filter(Boolean))];
    const units = new Map(
      (unitIds.length ? await prisma.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, arName: true } }) : []).map(
        (u) => [u.id, u],
      ),
    );
    lines = data.lines.map((l) => {
      const unit = l.unitId ? units.get(l.unitId) : null;
      if (l.unitId && !unit) throw new AppError("InvalidUnit");
      return {
        itemId: null,
        description: l.description,
        unitName: unit ? unit.arName : l.unitName,
        unitId: unit ? unit.id : null,
        qty: l.qty,
        price: l.price,
        amount: itemAmount(l.qty, l.price, decimals),
        itemNo: null,
      };
    });
  }
  const valued = lines.filter((l) => l.amount > 0);
  if (!valued.length) throw new AppError("CertNoWorks");

  // ---------- الحساب ----------
  const gross = round(valued.reduce((s, l) => s + l.amount, 0), decimals);
  const otherRecovered = c.certificates.filter((k) => k.id !== x.id).reduce((s, k) => s + n(k.recovery), 0);
  const advanceLeft = c.isDirect
    ? gross
    : advanceBalance({
        advanceIssued: Boolean(c.advanceSaleId || c.advancePurchaseId),
        advanceAmount: c.advanceAmount,
        priorAdvance: c.priorAdvance,
        recovered: otherRecovered,
        decimals,
      });
  if (!c.isDirect && data.recovery > advanceLeft + 1e-9)
    throw new AppError("RecoveryOverAdvance", { left: advanceLeft }, { recovery: "RecoveryOverAdvance" });
  const calc = certificateCalc({
    amounts: valued.map((l) => l.amount),
    contract: { recoveryPct: 0, retentionPct: 0, taxRate: n(c.taxRate) },
    advanceLeft,
    recovery: data.recovery,
    retention: data.retention,
    penalty: n(x.penalty),
    decimals,
  });
  if (calc.net < 0) throw new AppError("CertNetNegative");
  if (data.paymentMethodId && data.paidAmount != null && data.paidAmount > calc.net + 1e-9)
    throw new AppError("PaidOverNet", { net: calc.net }, { paidAmount: "PaidOverNet" });
  const payAmount = data.paymentMethodId
    ? round(data.paidAmount != null && data.paidAmount > 0 ? data.paidAmount : calc.net, decimals)
    : 0;
  const payments =
    payAmount > 0
      ? [{ paymentMethodId: data.paymentMethodId, amount: payAmount, reference: data.reference ?? null }]
      : [];

  // ---------- الفاتورة (بنفس رقمها) ----------
  const doc = await createDoc(c, user, {
    productType: "work",
    lines: valued.map((l) => ({
      name: `${l.itemNo ? `${l.itemNo} - ` : ""}${l.description}`,
      amount: l.amount,
      unitId: l.unitId ?? null,
      qty: l.qty,
      price: l.price,
      note:
        !l.unitId && (l.itemId || l.qty !== 1)
          ? `${Number(l.qty)} ${l.unitName ?? ""} × ${Number(l.price)}`.trim()
          : null,
    })),
    discount: calc.recovery,
    payments,
    notes: (x.sale?.notes ?? x.purchase?.notes ?? `مستخلص رقم ${certificateDocNo(x)}`).slice(0, 500),
    supplierInvoiceNo: x.purchase?.supplierInvoiceNo ?? `${contractDocNo(c)}-${x.seq}`,
    docId,
  });
  const saved = doc.saleId
    ? await prisma.sale.findUnique({ where: { id: doc.saleId }, select: { taxAmount: true, totalAmount: true } })
    : await prisma.purchase.findUnique({ where: { id: doc.purchaseId }, select: { taxAmount: true, totalAmount: true } });
  const invoiceTotal = n(saved.totalAmount);
  await prisma.constructionCertificate.update({
    where: { id: x.id },
    data: {
      gross: calc.gross,
      recovery: calc.recovery,
      taxAmount: n(saved.taxAmount),
      invoiceTotal,
      retention: calc.retention,
      netPayable: round(invoiceTotal - calc.retention - n(x.penalty), decimals),
      clientRef: data.clientRef ?? null,
      notes: data.notes ?? null,
      ...(qtyMode || !data.lines?.length
        ? {}
        : {
            certLines: {
              deleteMany: {},
              create: lines.map((l) => ({
                itemId: null,
                description: l.description,
                unitName: l.unitName,
                qty: l.qty,
                price: l.price,
                amount: l.amount,
              })),
            },
          }),
    },
  });
  const zatca = doc.saleId ? await afterSaleSaved(doc.saleId, {}).catch(() => null) : null;
  return { id: x.id, ...doc, zatca };
}

// ------------------------------------------------------------
// إلغاء المستخلص بمرتجع (الفاتورة اتبعتت للهيئة أو عليها سداد ومينفعش تتحذف)
// - مرتجع بالفاتورة كلها (مرتجع مبيعات = إشعار دائن للهيئة / مرتجع مشتريات لمقاول الباطن)
//   المبلغ بيرجع على حساب الطرف (مش نقدي)
// - المستخلص بيتعلّم «ملغي» ويخرج من حسابات العقد (الأعمال والاسترداد والضمان)
// - غرامة التأخير: سند التسوية بيتمسح (لو ينفع)
// - الختامي: العقد بيرجع «ساري»
// ------------------------------------------------------------
export async function cancelCertificate(id, user) {
  await assertModule(MODULE);
  const x = await prisma.constructionCertificate.findUnique({
    where: { id },
    select: {
      id: true,
      seq: true,
      number: true,
      docCode: true,
      isFinal: true,
      cancelled: true,
      clientRef: true,
      saleId: true,
      purchaseId: true,
      penaltyVoucherId: true,
      contract: { select: { id: true, kind: true, branchId: true, number: true, docCode: true, isDirect: true } },
    },
  });
  if (!x || (!can(user, "allBranches.view") && x.contract.branchId !== user.branch.id))
    throw new AppError("NotFound");
  if (x.cancelled) throw new AppError("CertCancelled");
  const c = x.contract;
  const acting = actingUser(user, c.branchId);
  const label = c.isDirect
    ? `إلغاء مستخلص رقم ${certificateDocNo(x)}${x.clientRef ? ` - رقم العميل ${x.clientRef}` : ""}`
    : `إلغاء مستخلص رقم ${certificateDocNo(x)} - عقد ${contractDocNo(c)}`;

  // الكميات اللي لسه مترجعتش من كل سطر (مرتجع بالفاتورة كلها)
  const lineRows = x.saleId
    ? await prisma.saleItem.findMany({ where: { saleId: x.saleId }, select: { id: true, qty: true, returnedQty: true } })
    : await prisma.purchaseItem.findMany({ where: { purchaseId: x.purchaseId }, select: { id: true, qty: true, returnedQty: true } });
  const items = lineRows
    .map((l) => ({ itemId: l.id, qty: round(n(l.qty) - n(l.returnedQty), 3) }))
    .filter((l) => l.qty > 0);
  if (!items.length) throw new AppError("CertAlreadyReturned");

  let returnDocId;
  if (x.saleId) {
    const ret = await createSaleReturn(
      createSaleReturnSchema.parse({ saleId: x.saleId, notes: label.slice(0, 500), items, payments: [] }),
      acting,
    );
    returnDocId = ret.id;
  } else {
    const ret = await createPurchaseReturn(
      createPurchaseReturnSchema.parse({ purchaseId: x.purchaseId, notes: label.slice(0, 500), items, payments: [] }),
      acting,
    );
    returnDocId = ret.id;
  }
  // سند الغرامة (تسوية) بيتمسح: لو مينفعش (مثلاً اتعمل عليه حاجة) بيفضل زي ما هو
  if (x.penaltyVoucherId) await deleteVoucher(x.penaltyVoucherId, acting).catch(() => {});
  await prisma.$transaction([
    prisma.constructionCertificate.update({
      where: { id: x.id },
      data: { cancelled: true, returnDocId },
    }),
    ...(x.isFinal
      ? [prisma.constructionContract.update({ where: { id: c.id }, data: { status: "active" } })]
      : []),
  ]);
  // المرتجع (إشعار دائن) للهيئة: نفس اللي بيحصل بعد حفظ أي مرتجع
  const zatca = x.saleId ? await afterSaleSaved(returnDocId, {}).catch(() => null) : null;
  return { id: x.id, returnDocId, zatca };
}

// ------------------------------------------------------------
// المستخلص السريع (من غير عقد)
// - بيتسجل على «حساب المستخلصات السريعة» للعميل (عقد مخفي واحد لكل عميل في الفرع)
//   عشان الضمان المحجوز والإفراج عنه يتتابعوا
// - البنود (أو إجمالي واحد) ← قيمة الأعمال، والاسترداد والضمان نسبة منها أو مبلغ
// - نفس حساب وفاتورة مستخلص العقد بالظبط (createCertificate)
// ------------------------------------------------------------
const DIRECT_NAME = "مستخلصات بدون عقد";

async function directContract(customerId, user) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...partyBranchWhere(user) },
    select: { id: true },
  });
  if (!customer) throw new AppError("CustomerNotFound");
  const branchId = user.branch.id;
  const where = { branchId, customerId, isDirect: true };
  const found = await prisma.constructionContract.findFirst({ where, select: { id: true } });
  if (found) return found.id;
  const settings = await getSystemSettings();
  const now = dayToDbDate(today());
  try {
    const created = await prisma.constructionContract.create({
      data: {
        branchId,
        // رقم داخلي (سالب) عشان ميستهلكش من تسلسل أرقام العقود
        number: -customerId,
        kind: "owner",
        isDirect: true,
        customerId,
        projectName: DIRECT_NAME,
        signDate: now,
        endDate: now,
        taxRate: Number(settings.taxRate ?? 15),
        createdById: user.id,
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    // اتعمل في نفس اللحظة من جهاز تاني
    if (error?.code !== "P2002") throw error;
    const again = await prisma.constructionContract.findFirst({ where, select: { id: true } });
    if (!again) throw error;
    return again.id;
  }
}

export async function createQuickCertificate(data, user) {
  await assertModule(MODULE);
  const decimals = await decimalsOf();
  const contractId = await directContract(data.customerId, user);
  const gross = round(data.lines.reduce((s, l) => s + itemAmount(l.qty, l.price, decimals), 0), decimals);
  const valueOf = (type, v) => round(type === "pct" ? (gross * v) / 100 : v, decimals);
  return createCertificate(
    {
      contractId,
      date: data.date,
      periodFrom: null,
      periodTo: null,
      mode: "lump",
      isFinal: false,
      lines: data.lines.map((l) => ({
        itemId: null,
        description: l.description,
        unitName: l.unitName,
        unitId: l.unitId ?? null,
        qty: l.qty,
        price: l.price,
      })),
      recovery: valueOf(data.recoveryType, data.recoveryValue),
      retention: valueOf(data.retentionType, data.retentionValue),
      penalty: 0,
      clientRef: data.clientRef,
      notes: data.notes,
      paymentMethodId: data.paymentMethodId,
      reference: data.reference,
      paidAmount: data.paidAmount,
    },
    user,
  );
}

// ------------------------------------------------------------
// تقرير المستخلصات (كل المستخلصات: عقود المالك ومقاولي الباطن والسريعة)
// filters: { q, from, to, kind: all | owner | sub | quick, page }
// all: كل الصفوف (التصدير) | الإجماليات على كل اللي في الفلتر (من غير الملغي)
// + الضمان المحجوز من المستخلصات السريعة عند كل عميل (للإفراج)
// ------------------------------------------------------------
export async function listCertificates({ q = "", from = null, to = null, kind = "all", page = 1, pageSize = 30, all = false }, user) {
  await assertModule(MODULE);
  const text = q.trim();
  const scope = can(user, "allBranches.view") ? {} : { branchId: user.branch.id };
  const last = text.split("-").pop();
  const where = {
    contract: {
      ...scope,
      ...(kind === "quick" ? { isDirect: true } : kind === "owner" ? { kind: "owner", isDirect: false } : kind === "sub" ? { kind: "sub" } : {}),
    },
    ...(from || to
      ? { date: { ...(from ? { gte: dayToDbDate(from) } : {}), ...(to ? { lte: dayToDbDate(to) } : {}) } }
      : {}),
    ...(text
      ? {
          OR: [
            ...(/^\d+$/.test(last) ? [{ number: Number(last) }] : []),
            { clientRef: { contains: text } },
            { contract: { projectName: { contains: text } } },
            { contract: { customer: { arName: { contains: text } } } },
            { contract: { customer: { phone: { contains: text } } } },
            { contract: { supplier: { arName: { contains: text } } } },
          ],
        }
      : {}),
  };
  const DOC = { select: { id: true, type: true, number: true, docCode: true, remainingAmount: true, settledAmount: true } };
  const [total, rows, sums, accounts] = await Promise.all([
    prisma.constructionCertificate.count({ where }),
    prisma.constructionCertificate.findMany({
      where,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      ...(all ? { take: 5000 } : { skip: (page - 1) * pageSize, take: pageSize }),
      select: {
        id: true,
        seq: true,
        number: true,
        docCode: true,
        date: true,
        clientRef: true,
        gross: true,
        recovery: true,
        taxAmount: true,
        invoiceTotal: true,
        retention: true,
        penalty: true,
        netPayable: true,
        cancelled: true,
        sale: DOC,
        purchase: DOC,
        contract: {
          select: {
            id: true,
            kind: true,
            number: true,
            docCode: true,
            isDirect: true,
            projectName: true,
            customer: { select: { arName: true, enName: true, phone: true } },
            supplier: { select: { arName: true, enName: true, phone: true } },
          },
        },
      },
    }),
    prisma.constructionCertificate.aggregate({
      where: { ...where, cancelled: false },
      _sum: { gross: true, recovery: true, taxAmount: true, invoiceTotal: true, retention: true, netPayable: true },
    }),
    prisma.constructionContract.findMany({
      where: { isDirect: true, ...scope },
      select: {
        id: true,
        customer: { select: { arName: true, enName: true } },
        certificates: { where: { cancelled: false }, select: { retention: true } },
        payments: { where: { kind: "retention" }, select: { amount: true } },
      },
    }),
  ]);
  const r = (v) => round(v, 2);
  return {
    total,
    page,
    pageSize,
    rows: rows.map((x) => {
      const c = x.contract;
      const inv = x.sale ?? x.purchase;
      return {
        id: x.id,
        docNo: certificateDocNo(x),
        seq: x.seq,
        date: day(x.date),
        clientRef: x.clientRef,
        gross: n(x.gross),
        recovery: n(x.recovery),
        taxAmount: n(x.taxAmount),
        invoiceTotal: n(x.invoiceTotal),
        retention: n(x.retention),
        penalty: n(x.penalty),
        netPayable: n(x.netPayable),
        cancelled: x.cancelled,
        kind: c.isDirect ? "quick" : c.kind,
        contract: c.isDirect ? null : { id: c.id, docNo: contractDocNo(c), projectName: c.projectName },
        party: c.customer ?? c.supplier,
        invoice: inv
          ? {
              id: inv.id,
              sub: Boolean(x.purchase),
              docNo: x.purchase ? formatDocNo("purchase", inv.number, inv.docCode) : formatDocNo("sale", inv.number, inv.docCode),
              // المتبقي من غير حجز الضمان (الضمان ليه عموده، ويتحصّل عند الإفراج)
              remaining: Math.max(0, r(n(inv.remainingAmount) - n(inv.settledAmount) - n(x.retention))),
            }
          : null,
      };
    }),
    totals: {
      gross: r(n(sums._sum.gross)),
      recovery: r(n(sums._sum.recovery)),
      taxAmount: r(n(sums._sum.taxAmount)),
      invoiceTotal: r(n(sums._sum.invoiceTotal)),
      retention: r(n(sums._sum.retention)),
      netPayable: r(n(sums._sum.netPayable)),
    },
    // الضمان المحجوز من المستخلصات السريعة عند كل عميل (اللي لسه ما اتفرجش عنه)
    retentions: accounts
      .map((a) => {
        const held = r(a.certificates.reduce((s, x) => s + n(x.retention), 0));
        const released = r(a.payments.reduce((s, x) => s + n(x.amount), 0));
        return { contractId: a.id, customer: a.customer, held, released, left: r(held - released) };
      })
      .filter((a) => a.left > 0.004),
  };
}

// ------------------------------------------------------------
// حذف آخر مستخلص (للتصحيح): الفاتورة بنفس قيود حذف الفواتير + سند الغرامة
// ------------------------------------------------------------
export async function deleteCertificate(id, user) {
  await assertModule(MODULE);
  const x = await prisma.constructionCertificate.findUnique({
    where: { id },
    select: {
      id: true,
      seq: true,
      isFinal: true,
      cancelled: true,
      saleId: true,
      purchaseId: true,
      penaltyVoucherId: true,
      contract: {
        select: {
          id: true,
          kind: true,
          branchId: true,
          certificates: { orderBy: { seq: "desc" }, take: 1, select: { id: true } },
        },
      },
    },
  });
  if (!x || (!can(user, "allBranches.view") && x.contract.branchId !== user.branch.id))
    throw new AppError("NotFound");
  if (x.contract.certificates[0]?.id !== x.id) throw new AppError("CertNotLast");
  if (x.cancelled) throw new AppError("CertCancelled");
  const c = x.contract;
  // قبل حذف سند الغرامة: الفاتورة نفسها لازم تكون قابلة للحذف
  if (x.saleId) {
    await assertNotProductionLive();
    const signed = await prisma.zatcaDocument.findUnique({ where: { saleId: x.saleId }, select: { id: true } });
    if (signed) throw new AppError("ZatcaInvoiceLocked");
  }
  const otherPaid = await prisma.voucherAllocation.count({
    where: {
      ...(x.saleId ? { saleId: x.saleId } : { purchaseId: x.purchaseId }),
      ...(x.penaltyVoucherId ? { voucherId: { not: x.penaltyVoucherId } } : {}),
    },
  });
  if (otherPaid) throw new AppError("InvoiceHasSettlements");

  if (x.penaltyVoucherId) await deleteVoucher(x.penaltyVoucherId, actingUser(user, c.branchId));
  await dropDoc(c, user, { saleId: x.saleId, purchaseId: x.purchaseId });
  await prisma.$transaction([
    prisma.constructionCertificate.delete({ where: { id: x.id } }),
    ...(x.isFinal
      ? [prisma.constructionContract.update({ where: { id: c.id }, data: { status: "active" } })]
      : []),
  ]);
  return { deleted: 1 };
}

// ------------------------------------------------------------
// المستخلص للطباعة: السطور بالسابق والحالي والتراكمي + ملخص المبالغ
// ------------------------------------------------------------
export async function getCertificate(id, user) {
  await assertModule(MODULE);
  const x = await prisma.constructionCertificate.findUnique({
    where: { id },
    select: {
      id: true,
      seq: true,
      date: true,
      periodFrom: true,
      periodTo: true,
      mode: true,
      isFinal: true,
      gross: true,
      recovery: true,
      taxRate: true,
      taxAmount: true,
      invoiceTotal: true,
      retention: true,
      penalty: true,
      netPayable: true,
      notes: true,
      clientRef: true,
      cancelled: true,
      number: true,
      docCode: true,
      contractId: true,
      sale: {
        select: {
          id: true,
          type: true,
          number: true,
          docCode: true,
          totalAmount: true,
          remainingAmount: true,
          payments: { take: 1, select: { paymentMethodId: true, reference: true } },
        },
      },
      purchase: {
        select: {
          id: true,
          type: true,
          number: true,
          docCode: true,
          supplierInvoiceNo: true,
          totalAmount: true,
          remainingAmount: true,
          payments: { take: 1, select: { paymentMethodId: true, reference: true } },
        },
      },
      certLines: {
        orderBy: { id: "asc" },
        select: { itemId: true, description: true, unitName: true, qty: true, price: true, amount: true },
      },
      contract: {
        select: {
          id: true,
          number: true,
          docCode: true,
          kind: true,
          branchId: true,
          projectName: true,
          projectLocation: true,
          refNo: true,
          signDate: true,
          endDate: true,
          isDirect: true,
          totalAmount: true,
          advanceAmount: true,
          recoveryPct: true,
          retentionPct: true,
          customer: { select: { arName: true, enName: true, taxNo: true, phone: true } },
          supplier: { select: { arName: true, enName: true, taxNo: true, phone: true } },
          branch: { select: { id: true, arName: true, enName: true } },
          items: {
            orderBy: { seq: "asc" },
            select: { id: true, itemNo: true, description: true, unitName: true, qty: true, price: true, amount: true },
          },
          certificates: {
            select: {
              seq: true,
              cancelled: true,
              gross: true,
              recovery: true,
              retention: true,
              penalty: true,
              taxAmount: true,
              invoiceTotal: true,
              netPayable: true,
              certLines: { select: { itemId: true, qty: true, amount: true } },
            },
          },
        },
      },
    },
  });
  if (!x || (!can(user, "allBranches.view") && x.contract.branchId !== user.branch.id)) return null;
  const c = x.contract;
  const before = c.certificates.filter((k) => k.seq < x.seq && !k.cancelled);
  const prevOf = (itemId) => {
    let qty = 0;
    let amount = 0;
    for (const k of before)
      for (const l of k.certLines)
        if (l.itemId === itemId) {
          qty += n(l.qty);
          amount += n(l.amount);
        }
    return { qty: round(qty, 3), amount: round(amount, 4) };
  };
  const cur = new Map(x.certLines.filter((l) => l.itemId).map((l) => [l.itemId, l]));
  // بالكميات: كل بنود المقايسة (حتى اللي مفيهاش شغل في المستخلص ده) + البنود الحرة
  const rows =
    x.mode === "qty"
      ? c.items.map((it) => {
          const prev = prevOf(it.id);
          const now = cur.get(it.id);
          const qty = now ? n(now.qty) : 0;
          const amount = now ? n(now.amount) : 0;
          return {
            itemNo: it.itemNo,
            description: it.description,
            unitName: it.unitName,
            contractQty: n(it.qty),
            price: n(it.price),
            contractAmount: n(it.amount),
            prevQty: prev.qty,
            prevAmount: prev.amount,
            qty,
            amount,
            totalQty: round(prev.qty + qty, 3),
            totalAmount: round(prev.amount + amount, 4),
          };
        })
      : [];
  const extra = x.certLines
    .filter((l) => !l.itemId || x.mode !== "qty")
    .map((l) => ({
      description: l.description,
      unitName: l.unitName,
      qty: n(l.qty),
      price: n(l.price),
      amount: n(l.amount),
    }));
  const sumOf = (list, key) => round(list.reduce((s, k) => s + n(k[key]), 0), 4);
  return {
    id: x.id,
    seq: x.seq,
    docNo: certificateDocNo(x),
    date: day(x.date),
    periodFrom: day(x.periodFrom),
    periodTo: day(x.periodTo),
    mode: x.mode,
    isFinal: x.isFinal,
    gross: n(x.gross),
    recovery: n(x.recovery),
    taxRate: n(x.taxRate),
    taxAmount: n(x.taxAmount),
    invoiceTotal: n(x.invoiceTotal),
    retention: n(x.retention),
    penalty: n(x.penalty),
    netPayable: n(x.netPayable),
    notes: x.notes,
    clientRef: x.clientRef,
    cancelled: x.cancelled,
    // الفاتورة + السداد عليها (نافذة التعديل)
    invoice: (() => {
      const inv = x.sale ?? x.purchase;
      if (!inv) return null;
      return {
        id: inv.id,
        type: inv.type,
        number: inv.number,
        docCode: inv.docCode,
        supplierInvoiceNo: inv.supplierInvoiceNo ?? null,
        sub: Boolean(x.purchase),
        total: n(inv.totalAmount),
        paid: round(n(inv.totalAmount) - n(inv.remainingAmount), 2),
        payment: inv.payments?.[0] ?? null,
      };
    })(),
    rows,
    extra,
    // المستخلصات السابقة (تراكمي) للملخص
    previous: {
      gross: sumOf(before, "gross"),
      recovery: sumOf(before, "recovery"),
      retention: sumOf(before, "retention"),
      penalty: sumOf(before, "penalty"),
      netPayable: sumOf(before, "netPayable"),
    },
    contract: {
      id: c.id,
      docNo: contractDocNo(c),
      kind: c.kind,
      projectName: c.projectName,
      projectLocation: c.projectLocation,
      refNo: c.refNo,
      signDate: day(c.signDate),
      endDate: day(c.endDate),
      isDirect: c.isDirect,
      totalAmount: n(c.totalAmount),
      advanceAmount: n(c.advanceAmount),
      recoveryPct: n(c.recoveryPct),
      retentionPct: n(c.retentionPct),
      party: c.customer ?? c.supplier,
      branch: c.branch,
    },
  };
}

// ------------------------------------------------------------
// معاينة إجمالي فاتورة الدفعة المقدمة (نافذة الإصدار)
// ------------------------------------------------------------
export async function advancePreview(contractId, user, amountOverride = null) {
  await assertModule(MODULE);
  const c = await loadContract(contractId, user, { advanceAmount: true, taxRate: true });
  const decimals = await decimalsOf();
  const amount = amountOverride ?? n(c.advanceAmount);
  const { totals } = calcInvoice({
    items: [{ qty: 1, price: amount, taxRate: n(c.taxRate) }],
    taxMode: "exclusive",
    decimals,
  });
  return { amount, tax: totals.tax, total: totals.total };
}

// ------------------------------------------------------------
// التحصيل من المالك (سند قبض) / السداد لمقاول الباطن (سند صرف)
// kind: payment دفعة | retention إفراج عن حجز الضمان (بحد أقصى المحجوز)
// ------------------------------------------------------------
export async function addPayment(data, user) {
  await assertModule(MODULE);
  const decimals = await decimalsOf();
  const c = await loadContract(data.contractId, user, {
    kind: true,
    number: true,
    docCode: true,
    customerId: true,
    supplierId: true,
    isDirect: true,
    certificates: { where: { cancelled: false }, select: { retention: true } },
    payments: { where: { kind: "retention" }, select: { amount: true } },
  });
  if (data.kind === "retention") {
    const held = c.certificates.reduce((s, x) => s + n(x.retention), 0);
    const released = c.payments.reduce((s, x) => s + n(x.amount), 0);
    const left = round(held - released, decimals);
    if (data.amount > left + 0.009) throw new AppError("RetentionOverHeld", { left });
  }
  const label = data.kind === "retention" ? "إفراج عن حجز الضمان" : "دفعة";
  const docNo = c.isDirect ? null : contractDocNo(c);
  const v = await createVoucher(
    {
      type: c.kind === "sub" ? "payment" : "receipt",
      partyType: c.kind === "sub" ? "supplier" : "customer",
      customerId: c.kind === "sub" ? null : c.customerId,
      supplierId: c.kind === "sub" ? c.supplierId : null,
      paymentMethodId: data.paymentMethodId,
      amount: data.amount,
      reference: data.reference ?? null,
      notes: `${label}${docNo ? ` - عقد ${docNo}` : " - مستخلصات بدون عقد"}${data.notes ? ` - ${data.notes}` : ""}`.slice(0, 500),
    },
    actingUser(user, c.branchId),
  );
  try {
    await prisma.constructionPayment.create({
      data: {
        contractId: c.id,
        kind: data.kind,
        date: dayToDbDate(today()),
        amount: round(data.amount, decimals),
        voucherId: v.id,
        notes: data.notes,
        createdById: user.id,
      },
    });
  } catch (error) {
    await deleteVoucher(v.id, actingUser(user, c.branchId)).catch(() => {});
    throw error;
  }
  return { voucherId: v.id };
}

// حذف دفعة (السند بيتمسح معاها)
export async function deletePayment(id, user) {
  await assertModule(MODULE);
  const p = await prisma.constructionPayment.findUnique({
    where: { id },
    select: { id: true, voucherId: true, contract: { select: { branchId: true } } },
  });
  if (!p || (!can(user, "allBranches.view") && p.contract.branchId !== user.branch.id))
    throw new AppError("NotFound");
  await deleteVoucher(p.voucherId, actingUser(user, p.contract.branchId));
  return { deleted: 1 };
}
