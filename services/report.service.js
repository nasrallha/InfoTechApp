import "server-only";
import { docNumberWhere } from "./sequence.service";
import { partyBranchWhere } from "@/lib/party-scope";
import { SUBSCRIPTION_METHOD_TYPE } from "./payment-method.service";
import { hasModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { round } from "@/lib/invoice-calc";
import { dayToDbDate } from "@/lib/dates";
import { bizDayOf, bizMonthOf, bizRange } from "@/lib/business-day";
import { getDayStartHour } from "@/lib/business-day-server";
import {
  docSign,
  formatDocNo,
  purchaseDocNo,
  saleDocNo,
} from "@/lib/doc-number";

// ============================================================
// التقارير: المبيعات، المشتريات، الضريبة، الأرباح، اليومية + الصفحة الرئيسية
// كل التواريخ بتوقيت السعودية، والفروع حسب صلاحية المستخدم
// filters: { from, to (YYYY-MM-DD), branchId, userId, customerId, supplierId,
//            paymentMethodId, source, q (رقم المستند) }
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => round(v, 2);
const MAX_ROWS = 5000;

// الفرع: صاحب "كل الفروع" يختار (أو الكل)، وغيره فرعه فقط
export function reportBranch(user, branchId) {
  if (can(user, "allBranches.view")) return branchId ? { branchId } : {};
  return { branchId: user.branch.id };
}

// الفترة بأيام العمل (h = بداية يوم العمل، 0 = منتصف الليل)
// الضريبة بس بالتاريخ الحقيقي (h = 0)
const dateRange = (f, h = 0) => ({ date: bizRange(f, h) });
const dayOf = (date, h = 0) => bizDayOf(date, h);
const monthOf = (date, h = 0) => bizMonthOf(date, h);

// أيام الفترة (للرسم البياني): يوم بيوم لو أقل من 62 يوم، وإلا شهر بشهر
function buckets(from, to) {
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  const days = Math.round((end - start) / 86_400_000) + 1;
  const byMonth = days > 62;
  const keys = [];
  if (byMonth) {
    const d = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    );
    while (d <= end) {
      keys.push(d.toISOString().slice(0, 7));
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  } else {
    for (let i = 0; i < days; i++) {
      keys.push(
        new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10),
      );
    }
  }
  return { byMonth, keys };
}

const methodSelect = {
  select: { id: true, arName: true, enName: true, type: true },
};
const userSelect = { select: { id: true, arFullname: true, enFullname: true } };
const branchSelect = { select: { id: true, arName: true, enName: true } };

// خيارات الفلاتر (الفروع، الكاشير، العملاء، الموردين، طرق الدفع)
export async function getReportOptions(user, { parties = [] } = {}) {
  const allBranches = can(user, "allBranches.view");
  const [branches, users, methods, customers, suppliers] = await Promise.all([
    allBranches
      ? prisma.branch.findMany({
          orderBy: { id: "asc" },
          select: { id: true, arName: true, enName: true },
        })
      : null,
    prisma.user.findMany({
      where: allBranches
        ? { isOwner: false }
        : { isOwner: false, branchId: user.branch.id },
      orderBy: { id: "asc" },
      select: { id: true, arFullname: true, enFullname: true },
    }),
    prisma.paymentMethod.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, arName: true, enName: true, type: true },
    }),
    parties.includes("customer")
      ? prisma.customer.findMany({
          where: partyBranchWhere(user),
          orderBy: { code: "asc" },
          select: { id: true, code: true, arName: true, enName: true },
        })
      : null,
    parties.includes("supplier")
      ? prisma.supplier.findMany({
          where: partyBranchWhere(user),
          orderBy: { code: "asc" },
          select: { id: true, code: true, arName: true, enName: true },
        })
      : null,
  ]);
  // المجموعات الرئيسية (فلتر تقرير المبيعات)
  const categories = parties.includes("category")
    ? await prisma.category.findMany({
        where: { parentId: null },
        orderBy: { arName: "asc" },
        select: { id: true, arName: true, enName: true },
      })
    : null;
  return { branches, users, methods, customers, suppliers, categories };
}

// ------------------------------------------------------------
// تقرير المبيعات (الفواتير والمرتجعات)
// ------------------------------------------------------------
export async function salesReport(f, user) {
  const h = await getDayStartHour();
  const num = f.q ? await docNumberWhere(f.q, user, f.branchId) : null;
  // المجموعة الرئيسية: الفواتير اللي فيها أصنافها، والمبالغ بتاعة سطورها بس
  const catIds = await categoryWithChildren(f.categoryId);
  const catLines = catIds ? { product: { categoryId: { in: catIds } } } : null;
  const where = {
    ...dateRange(f, h),
    ...reportBranch(user, f.branchId),
    ...(f.userId ? { createdById: f.userId } : {}),
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(f.source ? { source: f.source } : {}),
    ...(f.paymentMethodId
      ? { payments: { some: { paymentMethodId: f.paymentMethodId } } }
      : {}),
    ...(num ? { number: num.number, AND: [{ branchId: num.branchId }] } : {}),
    ...(catLines ? { items: { some: catLines } } : {}),
  };
  const showProfit = can(user, "reports.profit");
  const docs = await prisma.sale.findMany({
    where,
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: MAX_ROWS,
    select: {
      id: true,
      type: true,
      number: true, docCode: true,
      source: true,
      date: true,
      customerArName: true,
      customerEnName: true,
      netAmount: true,
      taxAmount: true,
      totalAmount: true,
      paidAmount: true,
      remainingAmount: true,
      costAmount: true,
      itemsDiscount: true,
      invoiceDiscount: true,
      branch: branchSelect,
      createdBy: userSelect,
      payments: { select: { amount: true, paymentMethod: methodSelect } },
      ...(catLines
        ? {
            items: {
              where: catLines,
              select: {
                productId: true,
                qty: true,
                netAmount: true,
                taxAmount: true,
                totalAmount: true,
                costAmount: true,
                itemDiscount: true,
                invoiceDiscount: true,
              },
            },
          }
        : {}),
    },
  });
  // فلتر المجموعة: مبالغ الفاتورة = سطور المجموعة بس (+ نصيبها من رسوم التبغ)،
  // والدفع بنفس النسبة
  const catFees = catLines ? await categoryTobaccoFees(docs) : null;
  if (catLines)
    for (const d of docs) {
      const fee = catFees?.get(d.id) ?? { net: 0, tax: 0, total: 0 };
      const s = (k) => d.items.reduce((x, i) => x + n(i[k]), 0);
      const total = s("totalAmount") + fee.total;
      const ratio = n(d.totalAmount) ? total / n(d.totalAmount) : 0;
      d.netAmount = s("netAmount") + fee.net;
      d.taxAmount = s("taxAmount") + fee.tax;
      d.costAmount = s("costAmount");
      d.itemsDiscount = s("itemDiscount");
      d.invoiceDiscount = s("invoiceDiscount");
      d.paidAmount = n(d.paidAmount) * ratio;
      d.remainingAmount = n(d.remainingAmount) * ratio;
      d.payments = d.payments.map((p) => ({ ...p, amount: n(p.amount) * ratio }));
      d.totalAmount = total;
    }
  // رسوم التبغ اللي دخلت مع أصناف المجموعة (للعرض في قسم الرسوم)
  const catTobacco = catFees
    ? docs.reduce(
        (x, d) => x + docSign(d.type) * (catFees.get(d.id)?.total ?? 0),
        0,
      )
    : 0;

  const t = {
    sales: 0,
    salesCount: 0,
    returns: 0,
    returnsCount: 0,
    // الإشعارات الدائنة (تخفيض) والمدينة (زيادة)
    creditNotes: 0,
    creditNotesCount: 0,
    debitNotes: 0,
    debitNotesCount: 0,
    net: 0,
    tax: 0,
    total: 0,
    discount: 0,
    cost: 0,
    credit: 0,
  };
  const methods = new Map();
  const cashiers = new Map();
  const { byMonth, keys } = buckets(f.from, f.to);
  const chart = new Map(
    keys.map((k) => [k, { key: k, sales: 0, returns: 0, profit: 0 }]),
  );

  // فواتير الاشتراك (المغسلة): عددها والمدفوع من الرصيد
  const sub = { count: 0, amount: 0 };
  const rows = docs.map((d) => {
    const sign = docSign(d.type);
    const net = n(d.netAmount);
    const cost = n(d.costAmount);
    if (d.type === "sale") {
      t.sales += n(d.totalAmount);
      t.salesCount++;
    } else if (d.type === "return") {
      t.returns += n(d.totalAmount);
      t.returnsCount++;
    } else if (d.type === "credit") {
      t.creditNotes += n(d.totalAmount);
      t.creditNotesCount++;
    } else {
      t.debitNotes += n(d.totalAmount);
      t.debitNotesCount++;
    }
    t.net += sign * net;
    t.tax += sign * n(d.taxAmount);
    t.total += sign * n(d.totalAmount);
    t.discount += sign * (n(d.itemsDiscount) + n(d.invoiceDiscount));
    t.cost += sign * cost;
    t.credit += sign * n(d.remainingAmount);
    // المغسلة: المدفوع من رصيد الاشتراك ← للعلم بس (مش فلوس اتقبضت في الفاتورة)
    const fromWallet = d.payments
      .filter((p) => p.paymentMethod.type === SUBSCRIPTION_METHOD_TYPE)
      .reduce((x, p) => x + n(p.amount), 0);
    if (fromWallet > 0) {
      sub.count += sign;
      sub.amount += sign * fromWallet;
    }
    for (const p of d.payments) {
      if (p.paymentMethod.type === SUBSCRIPTION_METHOD_TYPE) continue;
      const m = methods.get(p.paymentMethod.id) ?? {
        ...p.paymentMethod,
        received: 0,
        refunded: 0,
      };
      if (sign > 0) m.received += n(p.amount);
      else m.refunded += n(p.amount);
      methods.set(p.paymentMethod.id, m);
    }
    const c = cashiers.get(d.createdBy.id) ?? {
      ...d.createdBy,
      count: 0,
      total: 0,
    };
    c.count += d.type === "sale" ? 1 : 0;
    c.total += sign * n(d.totalAmount);
    cashiers.set(d.createdBy.id, c);
    const key = byMonth ? monthOf(d.date, h) : dayOf(d.date, h);
    const b = chart.get(key);
    if (b) {
      if (sign > 0) b.sales += n(d.totalAmount);
      else b.returns += n(d.totalAmount);
      b.profit += sign * (net - cost);
    }
    return {
      id: d.id,
      type: d.type,
      docNo: saleDocNo(d.type, d.number, d.docCode),
      source: d.source,
      date: d.date,
      customerArName: d.customerArName,
      customerEnName: d.customerEnName,
      branch: d.branch,
      user: d.createdBy,
      net: sign * net,
      tax: sign * n(d.taxAmount),
      total: sign * n(d.totalAmount),
      paid: sign * n(d.paidAmount),
      credit: sign * n(d.remainingAmount),
      ...(showProfit ? { cost: sign * cost, profit: sign * (net - cost) } : {}),
    };
  });

  return {
    rows,
    truncated: docs.length >= MAX_ROWS,
    byMonth,
    totals: {
      salesCount: t.salesCount,
      returnsCount: t.returnsCount,
      sales: r2(t.sales),
      returns: r2(t.returns),
      creditNotesCount: t.creditNotesCount,
      creditNotes: r2(t.creditNotes),
      debitNotesCount: t.debitNotesCount,
      debitNotes: r2(t.debitNotes),
      net: r2(t.net),
      tax: r2(t.tax),
      total: r2(t.total),
      discount: r2(t.discount),
      credit: r2(t.credit),
      ...(showProfit ? { cost: r2(t.cost), profit: r2(t.net - t.cost) } : {}),
    },
    methods: [...methods.values()].map((m) => ({
      ...m,
      received: r2(m.received),
      refunded: r2(m.refunded),
      net: r2(m.received - m.refunded),
    })),
    cashiers: [...cashiers.values()].map((c) => ({ ...c, total: r2(c.total) })),
    // للعلم: الفواتير اللي اتدفعت (كلها أو جزء) من رصيد الاشتراك
    subscription: sub.count ? { count: sub.count, amount: r2(sub.amount) } : null,
    // المطعم: الرسوم في الفواتير دي (الخدمة / التوصيل / التبغ) - شامل الضريبة
    // فلتر المجموعة: رسوم التبغ الخاصة بأصنافها بس
    fees: catLines
      ? catFees
        ? { tobacco: r2(catTobacco) }
        : null
      : await restaurantFeeTotals(where),
    chart: [...chart.values()].map((b) => ({
      ...b,
      sales: r2(b.sales),
      returns: r2(b.returns),
      net: r2(b.sales - b.returns),
      ...(showProfit ? { profit: r2(b.profit) } : { profit: undefined }),
    })),
  };
}

// أكثر الأصناف مبيعاً (صافي بعد المرتجعات)
export async function topProducts(saleWhere, limit, withProfit = true) {
  const [sold, returned] = await Promise.all([
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: { sale: { ...saleWhere, type: "sale" } },
      _sum: { baseQty: true, netAmount: true, costAmount: true },
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: { sale: { ...saleWhere, type: "return" } },
      _sum: { baseQty: true, netAmount: true, costAmount: true },
    }),
  ]);
  const map = new Map();
  for (const s of sold) {
    map.set(s.productId, {
      productId: s.productId,
      qty: n(s._sum.baseQty),
      net: n(s._sum.netAmount),
      cost: n(s._sum.costAmount),
    });
  }
  for (const r of returned) {
    const m = map.get(r.productId) ?? {
      productId: r.productId,
      qty: 0,
      net: 0,
      cost: 0,
    };
    m.qty -= n(r._sum.baseQty);
    m.net -= n(r._sum.netAmount);
    m.cost -= n(r._sum.costAmount);
    map.set(r.productId, m);
  }
  const top = [...map.values()].sort((a, b) => b.net - a.net).slice(0, limit);
  const products = await prisma.product.findMany({
    where: { id: { in: top.map((x) => x.productId) } },
    select: {
      id: true,
      code: true,
      arName: true,
      enName: true,
      baseUnit: { select: { arName: true, enName: true } },
    },
  });
  return top.map((x) => {
    const p = products.find((pp) => pp.id === x.productId);
    return {
      ...p,
      qty: round(x.qty, 3),
      net: r2(x.net),
      ...(withProfit ? { cost: r2(x.cost), profit: r2(x.net - x.cost) } : {}),
    };
  });
}

// ------------------------------------------------------------
// تقرير المشتريات (الفواتير والمرتجعات)
// ------------------------------------------------------------
export async function purchasesReport(f, user) {
  const h = await getDayStartHour();
  const num = f.q ? await docNumberWhere(f.q, user, f.branchId) : null;
  const where = {
    ...dateRange(f, h),
    ...reportBranch(user, f.branchId),
    ...(f.userId ? { createdById: f.userId } : {}),
    ...(f.supplierId ? { supplierId: f.supplierId } : {}),
    ...(f.paymentMethodId
      ? { payments: { some: { paymentMethodId: f.paymentMethodId } } }
      : {}),
    ...(num ? { number: num.number, AND: [{ branchId: num.branchId }] } : {}),
  };
  const docs = await prisma.purchase.findMany({
    where,
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: MAX_ROWS,
    select: {
      id: true,
      type: true,
      number: true, docCode: true,
      date: true,
      supplierArName: true,
      supplierEnName: true,
      supplierInvoiceNo: true,
      netAmount: true,
      taxAmount: true,
      totalAmount: true,
      paidAmount: true,
      remainingAmount: true,
      branch: branchSelect,
      createdBy: userSelect,
      payments: { select: { amount: true, paymentMethod: methodSelect } },
    },
  });

  const t = {
    purchases: 0,
    purchasesCount: 0,
    returns: 0,
    returnsCount: 0,
    // إشعارات الموردين: الدائن (تخفيض) والمدين (زيادة)
    creditNotes: 0,
    creditNotesCount: 0,
    debitNotes: 0,
    debitNotesCount: 0,
    net: 0,
    tax: 0,
    total: 0,
    credit: 0,
  };
  const methods = new Map();
  const suppliers = new Map();
  const { byMonth, keys } = buckets(f.from, f.to);
  const chart = new Map(
    keys.map((k) => [k, { key: k, purchases: 0, returns: 0 }]),
  );

  const rows = docs.map((d) => {
    const sign = docSign(d.type);
    if (d.type === "purchase") {
      t.purchases += n(d.totalAmount);
      t.purchasesCount++;
    } else if (d.type === "return") {
      t.returns += n(d.totalAmount);
      t.returnsCount++;
    } else if (d.type === "credit") {
      t.creditNotes += n(d.totalAmount);
      t.creditNotesCount++;
    } else {
      t.debitNotes += n(d.totalAmount);
      t.debitNotesCount++;
    }
    t.net += sign * n(d.netAmount);
    t.tax += sign * n(d.taxAmount);
    t.total += sign * n(d.totalAmount);
    t.credit += sign * n(d.remainingAmount);
    for (const p of d.payments) {
      const m = methods.get(p.paymentMethod.id) ?? {
        ...p.paymentMethod,
        paid: 0,
        refunded: 0,
      };
      if (sign > 0) m.paid += n(p.amount);
      else m.refunded += n(p.amount);
      methods.set(p.paymentMethod.id, m);
    }
    const sKey = `${d.supplierArName}|${d.supplierEnName}`;
    const s = suppliers.get(sKey) ?? {
      arName: d.supplierArName,
      enName: d.supplierEnName,
      count: 0,
      total: 0,
    };
    s.count += d.type === "purchase" ? 1 : 0;
    s.total += sign * n(d.totalAmount);
    suppliers.set(sKey, s);
    const b = chart.get(byMonth ? monthOf(d.date, h) : dayOf(d.date, h));
    if (b) {
      if (sign > 0) b.purchases += n(d.totalAmount);
      else b.returns += n(d.totalAmount);
    }
    return {
      id: d.id,
      type: d.type,
      docNo: purchaseDocNo(d.type, d.number, d.docCode),
      date: d.date,
      supplierArName: d.supplierArName,
      supplierEnName: d.supplierEnName,
      supplierInvoiceNo: d.supplierInvoiceNo,
      branch: d.branch,
      user: d.createdBy,
      net: sign * n(d.netAmount),
      tax: sign * n(d.taxAmount),
      total: sign * n(d.totalAmount),
      paid: sign * n(d.paidAmount),
      credit: sign * n(d.remainingAmount),
    };
  });

  return {
    rows,
    truncated: docs.length >= MAX_ROWS,
    byMonth,
    totals: {
      purchasesCount: t.purchasesCount,
      returnsCount: t.returnsCount,
      purchases: r2(t.purchases),
      returns: r2(t.returns),
      creditNotesCount: t.creditNotesCount,
      creditNotes: r2(t.creditNotes),
      debitNotesCount: t.debitNotesCount,
      debitNotes: r2(t.debitNotes),
      net: r2(t.net),
      tax: r2(t.tax),
      total: r2(t.total),
      credit: r2(t.credit),
    },
    methods: [...methods.values()].map((m) => ({
      ...m,
      paid: r2(m.paid),
      refunded: r2(m.refunded),
      net: r2(m.paid - m.refunded),
    })),
    suppliers: [...suppliers.values()]
      .map((s) => ({ ...s, total: r2(s.total) }))
      .sort((a, b) => b.total - a.total),
    chart: [...chart.values()].map((b) => ({
      ...b,
      purchases: r2(b.purchases),
      returns: r2(b.returns),
      net: r2(b.purchases - b.returns),
    })),
  };
}

// ------------------------------------------------------------
// إقرار ضريبة القيمة المضافة (ربع سنوي أو فترة)
// المخرجات (المبيعات) - المدخلات (المشتريات) = المستحق
// ------------------------------------------------------------
export async function vatReport(f, user) {
  const where = { ...dateRange(f), ...reportBranch(user, f.branchId) };
  const [sales, purchases] = await Promise.all([
    prisma.sale.findMany({
      where,
      select: {
        type: true,
        date: true,
        netAmount: true,
        taxAmount: true,
        totalAmount: true,
        customerTaxNo: true,
      },
    }),
    prisma.purchase.findMany({
      where,
      select: {
        type: true,
        date: true,
        netAmount: true,
        taxAmount: true,
        totalAmount: true,
      },
    }),
  ]);
  const blank = () => ({ net: 0, tax: 0, total: 0, count: 0 });
  // التعديلات: المرتجعات والإشعارات الدائنة (بالسالب) والمدينة (بالموجب)
  const out = {
    sales: blank(),
    returns: blank(),
    creditNotes: blank(),
    debitNotes: blank(),
    standard: blank(),
    simplified: blank(),
  };
  const inp = {
    purchases: blank(),
    returns: blank(),
    creditNotes: blank(),
    debitNotes: blank(),
  };
  const bucketOf = (side, type) =>
    type === "return"
      ? side.returns
      : type === "credit"
        ? side.creditNotes
        : type === "debit"
          ? side.debitNotes
          : null;
  const months = new Map();
  const add = (b, d) => {
    b.net += n(d.netAmount);
    b.tax += n(d.taxAmount);
    b.total += n(d.totalAmount);
    b.count++;
  };
  const month = (d) => {
    const k = monthOf(d.date);
    if (!months.has(k))
      months.set(k, {
        key: k,
        outputTax: 0,
        inputTax: 0,
        salesNet: 0,
        purchasesNet: 0,
      });
    return months.get(k);
  };
  for (const d of sales) {
    const m = month(d);
    const sign = docSign(d.type);
    const b = bucketOf(out, d.type);
    if (b) add(b, d);
    else {
      add(out.sales, d);
      add(d.customerTaxNo ? out.standard : out.simplified, d);
    }
    m.outputTax += sign * n(d.taxAmount);
    m.salesNet += sign * n(d.netAmount);
  }
  for (const d of purchases) {
    const m = month(d);
    const sign = docSign(d.type);
    const b = bucketOf(inp, d.type);
    if (b) add(b, d);
    else add(inp.purchases, d);
    m.inputTax += sign * n(d.taxAmount);
    m.purchasesNet += sign * n(d.netAmount);
  }
  // صافي جانب: الأساسي - المرتجع - الدائن + المدين
  const netOf = (side, main, key) =>
    side[main][key] -
    side.returns[key] -
    side.creditNotes[key] +
    side.debitNotes[key];
  const fix = (b) => ({
    count: b.count,
    net: r2(b.net),
    tax: r2(b.tax),
    total: r2(b.total),
  });
  const outputTax = netOf(out, "sales", "tax");
  const inputTax = netOf(inp, "purchases", "tax");
  return {
    output: {
      sales: fix(out.sales),
      returns: fix(out.returns),
      creditNotes: fix(out.creditNotes),
      debitNotes: fix(out.debitNotes),
      standard: fix(out.standard),
      simplified: fix(out.simplified),
      netSales: r2(netOf(out, "sales", "net")),
      tax: r2(outputTax),
    },
    input: {
      purchases: fix(inp.purchases),
      returns: fix(inp.returns),
      creditNotes: fix(inp.creditNotes),
      debitNotes: fix(inp.debitNotes),
      netPurchases: r2(netOf(inp, "purchases", "net")),
      tax: r2(inputTax),
    },
    payable: r2(outputTax - inputTax),
    months: [...months.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((m) => ({
        ...m,
        outputTax: r2(m.outputTax),
        inputTax: r2(m.inputTax),
        salesNet: r2(m.salesNet),
        purchasesNet: r2(m.purchasesNet),
        payable: r2(m.outputTax - m.inputTax),
      })),
  };
}

// ------------------------------------------------------------
// الأرباح
// إجمالي الربح = صافي المبيعات (بدون ضريبة) - تكلفة المبيعات
// صافي الربح = إجمالي الربح - خصم مسموح به + خصم مكتسب - المصروفات + إيرادات متنوعة
// ------------------------------------------------------------
// ------------------------------------------------------------
// ربح الأصناف (تقرير الأرباح لما يتحدد صنف / مجموعة / فاتورة):
// مبيعات الأصناف - مرتجعها، وتكلفتها وقت البيع ← مجمل الربح لكل صنف
// (المصروفات والخصومات العامة مش بتتحمّل على صنف، فمش بتدخل هنا)
// f.item: كود الصنف أو باركود وحدة أو جزء من اسمه
// ------------------------------------------------------------
async function itemsProfit(f, user, h) {
  const num = f.q ? await docNumberWhere(f.q, user, f.branchId) : null;
  const catIds = await categoryWithChildren(f.categoryId);
  const item = f.item ? String(f.item).trim() : "";
  const product = {
    AND: [
      ...(catIds ? [{ categoryId: { in: catIds } }] : []),
      ...(item
        ? [
            {
              OR: [
                { code: item },
                { productUnits: { some: { barcode: item } } },
                { arName: { contains: item } },
                { enName: { contains: item } },
              ],
            },
          ]
        : []),
    ],
  };
  // فاتورة معيّنة: الفاتورة نفسها ومرتجعاتها (من غير قيد الفترة، عشان الفاتورة القديمة تظهر)
  // غير كده: الفواتير والمرتجعات في الفترة
  const invoice = num
    ? {
        ...reportBranch(user, f.branchId),
        type: "sale",
        number: num.number,
        AND: [{ branchId: num.branchId }],
      }
    : null;
  const saleWhere = (type) =>
    invoice
      ? type === "sale"
        ? invoice
        : { type: "return", returnOf: invoice }
      : {
          ...dateRange(f, h),
          ...reportBranch(user, f.branchId),
          type,
        };
  const group = (type) =>
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: { sale: saleWhere(type), product },
      _sum: { baseQty: true, netAmount: true, costAmount: true },
    });
  const [sold, returned] = await Promise.all([group("sale"), group("return")]);

  const rows = new Map();
  const add = (g, sign) => {
    const r = rows.get(g.productId) ?? {
      productId: g.productId,
      soldQty: 0,
      returnedQty: 0,
      qty: 0,
      revenue: 0,
      cost: 0,
    };
    // المباع والمرتجع كل واحد لوحده، والصافي = المباع - المرتجع
    if (sign > 0) r.soldQty += n(g._sum.baseQty);
    else r.returnedQty += n(g._sum.baseQty);
    r.qty += sign * n(g._sum.baseQty);
    r.revenue += sign * n(g._sum.netAmount);
    r.cost += sign * n(g._sum.costAmount);
    rows.set(g.productId, r);
  };
  sold.forEach((g) => add(g, 1));
  returned.forEach((g) => add(g, -1));
  const products = await prisma.product.findMany({
    where: { id: { in: [...rows.keys()] } },
    select: {
      id: true,
      code: true,
      arName: true,
      enName: true,
      baseUnit: { select: { arName: true, enName: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = [...rows.values()]
    .map((r) => {
      const gross = r.revenue - r.cost;
      return {
        ...r,
        product: byId.get(r.productId) ?? null,
        soldQty: round(r.soldQty, 3),
        returnedQty: round(r.returnedQty, 3),
        qty: round(r.qty, 3),
        revenue: r2(r.revenue),
        cost: r2(r.cost),
        gross: r2(gross),
        margin: r.revenue ? r2((gross / r.revenue) * 100) : 0,
      };
    })
    .sort((a, b) => b.gross - a.gross);

  const sum = (list, k) => list.reduce((s, g) => s + n(g._sum[k]), 0);
  const salesNet = sum(sold, "netAmount");
  const returnsNet = sum(returned, "netAmount");
  const salesCost = sum(sold, "costAmount");
  const returnsCost = sum(returned, "costAmount");
  const revenue = salesNet - returnsNet;
  const cost = salesCost - returnsCost;
  const gross = revenue - cost;
  // ملخص الفاتورة (البحث برقم فاتورة): رقمها وتاريخها وعميلها ومبيعاتها وربحها
  const docs = invoice
    ? (
        await prisma.sale.findMany({
          where: invoice,
          take: 5,
          select: {
            id: true,
            type: true,
            number: true,
            docCode: true,
            date: true,
            customerArName: true,
            customerEnName: true,
            netAmount: true,
            costAmount: true,
            branch: { select: { arName: true, enName: true } },
          },
        })
      ).map((d) => ({
        ...d,
        docNo: saleDocNo(d.type, d.number, d.docCode),
        netAmount: r2(n(d.netAmount)),
        costAmount: r2(n(d.costAmount)),
      }))
    : [];
  return {
    mode: "items",
    docs,
    salesNet: r2(salesNet),
    returnsNet: r2(returnsNet),
    salesCost: r2(salesCost),
    returnsCost: r2(returnsCost),
    revenue: r2(revenue),
    cost: r2(cost),
    gross: r2(gross),
    grossMargin: revenue ? r2((gross / revenue) * 100) : 0,
    items,
  };
}

export async function profitReport(f, user) {
  const h = await getDayStartHour();
  // صنف / مجموعة / فاتورة ← ربح الأصناف بس
  if (f.item || f.categoryId || f.q) return itemsProfit(f, user, h);
  const branch = reportBranch(user, f.branchId);
  const range = dateRange(f, h);
  const saleWhere = { ...range, ...branch };
  const [sales, vouchers, supplierNotes] = await Promise.all([
    prisma.sale.findMany({
      where: saleWhere,
      select: { type: true, date: true, netAmount: true, costAmount: true },
    }),
    prisma.voucher.findMany({
      where: {
        ...range,
        ...branch,
        OR: [
          { type: "settlement" },
          { type: "payment", partyType: "expense" },
          { type: "receipt", partyType: "other" },
        ],
      },
      select: {
        type: true,
        partyType: true,
        date: true,
        amount: true,
        expenseCategory: { select: { id: true, arName: true, enName: true } },
      },
    }),
    // إشعارات الموردين: الدائن (خصم من المورد) يزوّد الربح، والمدين (رسوم زيادة) ينقّصه
    prisma.purchase.findMany({
      where: { ...range, ...branch, type: { in: ["credit", "debit"] } },
      select: { type: true, date: true, netAmount: true },
    }),
  ]);

  const { byMonth, keys } = buckets(f.from, f.to);
  const chart = new Map(
    keys.map((k) => [k, { key: k, revenue: 0, cost: 0, gross: 0, net: 0 }]),
  );
  const bucketOf = (date) =>
    chart.get(byMonth ? monthOf(date, h) : dayOf(date, h));

  let salesNet = 0;
  let returnsNet = 0;
  let salesCost = 0;
  let returnsCost = 0;
  // الإشعارات: الدائن ينقّص الإيراد والمدين يزوّده (من غير تكلفة)
  let creditNotesNet = 0;
  let debitNotesNet = 0;
  for (const s of sales) {
    const b = bucketOf(s.date);
    if (s.type === "credit" || s.type === "debit") {
      const v = n(s.netAmount);
      if (s.type === "credit") creditNotesNet += v;
      else debitNotesNet += v;
      if (b) b.revenue += docSign(s.type) * v;
    } else if (s.type === "return") {
      returnsNet += n(s.netAmount);
      returnsCost += n(s.costAmount);
      if (b) {
        b.revenue -= n(s.netAmount);
        b.cost -= n(s.costAmount);
      }
    } else {
      salesNet += n(s.netAmount);
      salesCost += n(s.costAmount);
      if (b) {
        b.revenue += n(s.netAmount);
        b.cost += n(s.costAmount);
      }
    }
  }

  let allowed = 0;
  let received = 0;
  let otherIncome = 0;
  const expenses = new Map();
  for (const v of vouchers) {
    const a = n(v.amount);
    const b = bucketOf(v.date);
    if (v.type === "settlement" && v.partyType === "customer") {
      allowed += a;
      if (b) b.net -= a;
    } else if (v.type === "settlement" && v.partyType === "supplier") {
      received += a;
      if (b) b.net += a;
    } else if (v.type === "payment") {
      const c = v.expenseCategory;
      const e = expenses.get(c?.id ?? 0) ?? {
        ...(c ?? { id: 0, arName: "-", enName: "-" }),
        amount: 0,
        count: 0,
      };
      e.amount += a;
      e.count++;
      expenses.set(c?.id ?? 0, e);
      if (b) b.net -= a;
    } else {
      otherIncome += a;
      if (b) b.net += a;
    }
  }
  let supplierCredits = 0;
  let supplierDebits = 0;
  for (const p of supplierNotes) {
    const v = n(p.netAmount);
    const b = bucketOf(p.date);
    if (p.type === "credit") supplierCredits += v;
    else supplierDebits += v;
    if (b) b.net -= docSign(p.type) * v;
  }

  const revenue = salesNet - returnsNet - creditNotesNet + debitNotesNet;
  const cost = salesCost - returnsCost;
  const gross = revenue - cost;
  const totalExpenses = [...expenses.values()].reduce(
    (s, e) => s + e.amount,
    0,
  );
  const net =
    gross -
    allowed +
    received -
    totalExpenses +
    otherIncome +
    supplierCredits -
    supplierDebits;

  return {
    salesNet: r2(salesNet),
    returnsNet: r2(returnsNet),
    creditNotesNet: r2(creditNotesNet),
    debitNotesNet: r2(debitNotesNet),
    supplierCredits: r2(supplierCredits),
    supplierDebits: r2(supplierDebits),
    revenue: r2(revenue),
    salesCost: r2(salesCost),
    returnsCost: r2(returnsCost),
    cost: r2(cost),
    gross: r2(gross),
    grossMargin: revenue ? r2((gross / revenue) * 100) : 0,
    discountAllowed: r2(allowed),
    discountReceived: r2(received),
    expenses: [...expenses.values()]
      .map((e) => ({ ...e, amount: r2(e.amount) }))
      .sort((a, b) => b.amount - a.amount),
    totalExpenses: r2(totalExpenses),
    otherIncome: r2(otherIncome),
    net: r2(net),
    netMargin: revenue ? r2((net / revenue) * 100) : 0,
    byMonth,
    chart: [...chart.values()].map((b) => ({
      key: b.key,
      revenue: r2(b.revenue),
      cost: r2(b.cost),
      gross: r2(b.revenue - b.cost),
      net: r2(b.revenue - b.cost + b.net),
    })),
  };
}

// ------------------------------------------------------------
// اليومية: الكاش والشبكة والتحويل فقط (بدون الآجل)
// لكل طريقة دفع: المبيعات - المرتجع + سندات القبض - المشتريات + مرتجع المشتريات
//                - سندات الصرف، وللنقدي: + الإضافة - السحب من الدرج
// ------------------------------------------------------------
// ============================================================
// المغسلة في اليومية (للعلم): أعداد الطلبات
// المسجّلة في الفترة، والمسلّمة فيها، والملغية، والباقية لحد دلوقتي
// ============================================================
async function laundryDaily(f, range, branch, byUser) {
  const days = {
    ...(f.from ? { gte: dayToDbDate(f.from) } : {}),
    ...(f.to ? { lte: dayToDbDate(f.to) } : {}),
  };
  const [registered, delivered, cancelled, remaining] = await Promise.all([
    prisma.laundryOrder.aggregate({
      where: { ...branch, ...byUser, bizDay: days, status: { not: "cancelled" } },
      _count: { _all: true },
      _sum: { totalQty: true },
    }),
    prisma.laundryOrder.aggregate({
      where: { ...branch, status: "delivered", deliveredAt: range.date },
      _count: { _all: true },
      _sum: { totalQty: true },
    }),
    prisma.laundryOrder.count({
      where: { ...branch, ...byUser, bizDay: days, status: "cancelled" },
    }),
    prisma.laundryOrder.aggregate({
      where: { ...branch, status: { in: ["received", "processing", "ready"] } },
      _count: { _all: true },
      _sum: { totalQty: true },
    }),
  ]);
  return {
    orders: {
      registered: registered._count._all,
      registeredQty: registered._sum.totalQty ?? 0,
      delivered: delivered._count._all,
      deliveredQty: delivered._sum.totalQty ?? 0,
      cancelled,
      remaining: remaining._count._all,
      remainingQty: remaining._sum.totalQty ?? 0,
    },
  };
}

export async function dailyReport(f, user) {
  const h = await getDayStartHour();
  const branch = reportBranch(user, f.branchId);
  const range = dateRange(f, h);
  const byUser = f.userId ? { createdById: f.userId } : {};
  // اليومية = حركة الفلوس من غير الآجل
  // "رصيد الاشتراك" (المغسلة): سطر للعلم بس (infoOnly) برا المجموع والصافي،
  // لأن فلوس الاشتراك دخلت وقت الشحن بسند قبض، والفاتورة بالرصيد مش فلوس جديدة
  const NOT_MONEY = ["credit"];
  const nonCredit = { paymentMethod: { type: { notIn: NOT_MONEY } } };

  const [salePays, purchasePays, vouchers, movements, shifts, methods] =
    await Promise.all([
      prisma.salePayment.findMany({
        where: { ...nonCredit, sale: { ...range, ...branch, ...byUser } },
        select: {
          amount: true,
          paymentMethodId: true,
          sale: { select: { type: true } },
        },
      }),
      prisma.purchasePayment.findMany({
        where: { ...nonCredit, purchase: { ...range, ...branch, ...byUser } },
        select: {
          amount: true,
          paymentMethodId: true,
          purchase: { select: { type: true } },
        },
      }),
      prisma.voucher.findMany({
        where: {
          ...range,
          ...branch,
          ...byUser,
          type: { in: ["receipt", "payment"] },
          paymentMethodId: { not: null },
        },
        select: {
          id: true,
          type: true,
          number: true, docCode: true,
          partyType: true,
          partyArName: true,
          partyEnName: true,
          amount: true,
          date: true,
          paymentMethodId: true,
        },
        orderBy: { date: "asc" },
      }),
      prisma.cashMovement.findMany({
        where: {
          createdAt: range.date,
          ...branch,
          ...byUser,
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          amount: true,
          reason: true,
          createdAt: true,
          createdBy: userSelect,
          shift: { select: { number: true, docCode: true } },
        },
      }),
      prisma.shift.findMany({
        // ورديات أيام العمل دي (حسب يوم فتحها) اللي اتقفلت
        where: {
          status: "closed",
          businessDay: {
            ...(f.from ? { gte: dayToDbDate(f.from) } : {}),
            ...(f.to ? { lte: dayToDbDate(f.to) } : {}),
          },
          ...branch,
          ...(f.userId ? { userId: f.userId } : {}),
        },
        orderBy: [{ businessDay: "asc" }, { closedAt: "asc" }],
        select: {
          id: true,
          number: true, docCode: true,
          businessDay: true,
          dayNo: true,
          user: userSelect,
          openedAt: true,
          closedAt: true,
          openingCash: true,
          expectedCash: true,
          countedCash: true,
          difference: true,
          cardExpected: true,
          cardCounted: true,
          cardDifference: true,
          depositedCash: true,
          leftCash: true,
        },
      }),
      prisma.paymentMethod.findMany({
        where: { type: { notIn: NOT_MONEY } },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, arName: true, enName: true, type: true },
      }),
    ]);

  const rows = new Map(
    methods.map((m) => [
      m.id,
      {
        ...m,
        sales: 0,
        salesReturns: 0,
        receipts: 0,
        purchases: 0,
        purchaseReturns: 0,
        payments: 0,
        cashIn: 0,
        cashOut: 0,
      },
    ]),
  );
  for (const p of salePays) {
    const r = rows.get(p.paymentMethodId);
    if (!r) continue;
    // الإشعار الدائن (مبلغ اترد) مع المرتجعات، والمدين (مبلغ اتحصّل) مع المبيعات
    if (docSign(p.sale.type) < 0) r.salesReturns += n(p.amount);
    else r.sales += n(p.amount);
  }
  for (const p of purchasePays) {
    const r = rows.get(p.paymentMethodId);
    if (!r) continue;
    if (docSign(p.purchase.type) < 0) r.purchaseReturns += n(p.amount);
    else r.purchases += n(p.amount);
  }
  for (const v of vouchers) {
    const r = rows.get(v.paymentMethodId);
    if (!r) continue;
    if (v.type === "receipt") r.receipts += n(v.amount);
    else r.payments += n(v.amount);
  }
  const cashRow = [...rows.values()].find((r) => r.type === "cash");
  let cashIn = 0;
  let cashOut = 0;
  for (const m of movements) {
    if (m.type === "in") cashIn += n(m.amount);
    else cashOut += n(m.amount);
  }
  if (cashRow) {
    cashRow.cashIn = cashIn;
    cashRow.cashOut = cashOut;
  }

  const list = [...rows.values()]
    .map((r) => {
      const fixed = Object.fromEntries(
        Object.entries(r).map(([k, v]) => [
          k,
          typeof v === "number" && k !== "id" ? r2(v) : v,
        ]),
      );
      // رصيد الاشتراك: للعلم (مالوش صافي)
      if (r.type === SUBSCRIPTION_METHOD_TYPE)
        return { ...fixed, infoOnly: true, net: 0 };
      return {
        ...fixed,
        net: r2(
          r.sales -
            r.salesReturns +
            r.receipts -
            r.purchases +
            r.purchaseReturns -
            r.payments +
            r.cashIn -
            r.cashOut,
        ),
      };
    })
    .filter(
      (r) =>
        [
          "sales",
          "salesReturns",
          "receipts",
          "purchases",
          "purchaseReturns",
          "payments",
          "cashIn",
          "cashOut",
        ].some((k) => r[k] !== 0) || r.type === "cash",
    );

  // المجموع من غير سطر الاشتراك (للعلم)
  const sum = (k) =>
    r2(list.filter((r) => !r.infoOnly).reduce((s, r) => s + r[k], 0));
  return {
    methods: list,
    totals: {
      sales: sum("sales"),
      salesReturns: sum("salesReturns"),
      receipts: sum("receipts"),
      purchases: sum("purchases"),
      purchaseReturns: sum("purchaseReturns"),
      payments: sum("payments"),
      cashIn: sum("cashIn"),
      cashOut: sum("cashOut"),
      net: sum("net"),
    },
    vouchers: vouchers.map((v) => ({
      ...v,
      amount: n(v.amount),
      docNo: formatDocNo(v.type, v.number, v.docCode),
      method: methods.find((m) => m.id === v.paymentMethodId) ?? null,
    })),
    movements: movements.map((m) => ({ ...m, amount: n(m.amount) })),
    shifts,
    // المطعم: الرسوم في فواتير الفترة (الخدمة / التوصيل / التبغ) - للعلم
    fees: await restaurantFeeTotals({ ...range, ...branch, ...byUser }),
    // المغسلة (وحدة laundry): للعلم بس، برا الصافي
    laundry: (await hasModule("laundry"))
      ? await laundryDaily(f, range, branch, byUser)
      : null,
  };
}

// ============================================================
// المطعم: الرسوم (الخدمة / التوصيل / التبغ) + تقرير التبغ
// الرسوم سطور في الفاتورة بأصناف الرسوم (الإعدادات: restaurant*ProductId)
// ============================================================
async function restaurantFeeProducts() {
  const s = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: {
      restaurantServiceProductId: true,
      restaurantDeliveryProductId: true,
      restaurantTobaccoProductId: true,
    },
  });
  return {
    service: s?.restaurantServiceProductId ?? null,
    delivery: s?.restaurantDeliveryProductId ?? null,
    tobacco: s?.restaurantTobaccoProductId ?? null,
  };
}

// فلتر المجموعة في تقرير المبيعات: نصيب أصناف المجموعة من رسوم التبغ لكل فاتورة
// docs: الفواتير وجواها items = سطور المجموعة بس (productId / qty / totalAmount)
// الرسوم بتتوزع على كل أصناف التبغ في الفاتورة (بالكمية لو مبلغ لكل وحدة، وبالقيمة لو نسبة)
// والمجموعة تاخد نصيب أصنافها بس ← Map(saleId → { net, tax, total })
// null = وحدة المطعم مقفولة أو مفيش صنف رسوم تبغ
async function categoryTobaccoFees(docs) {
  if (!docs.length || !(await hasModule("restaurant"))) return null;
  const [{ tobacco: feeId }, tobaccoItems, s] = await Promise.all([
    restaurantFeeProducts(),
    prisma.restaurantItem.findMany({
      where: { isTobacco: true },
      select: { productId: true },
    }),
    prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { restaurantTobaccoType: true },
    }),
  ]);
  if (!feeId) return null;
  const tobacco = new Set(tobaccoItems.map((i) => i.productId));
  const out = new Map();
  // الفواتير اللي فيها أصناف تبغ من المجموعة بس
  const ids = docs
    .filter((d) => d.items.some((i) => tobacco.has(i.productId)))
    .map((d) => d.id);
  if (!ids.length) return out;
  const lines = await prisma.saleItem.findMany({
    where: { saleId: { in: ids }, productId: { in: [...tobacco, feeId] } },
    select: {
      saleId: true,
      productId: true,
      qty: true,
      netAmount: true,
      taxAmount: true,
      totalAmount: true,
    },
  });
  const byQty = s?.restaurantTobaccoType === "amount";
  const w = (l) => (byQty ? n(l.qty) : n(l.totalAmount));
  const per = new Map();
  for (const l of lines) {
    const x = per.get(l.saleId) ?? { fee: { net: 0, tax: 0, total: 0 }, all: 0, count: 0 };
    if (l.productId === feeId) {
      x.fee.net += n(l.netAmount);
      x.fee.tax += n(l.taxAmount);
      x.fee.total += n(l.totalAmount);
    } else {
      x.all += w(l);
      x.count++;
    }
    per.set(l.saleId, x);
  }
  for (const d of docs) {
    const x = per.get(d.id);
    if (!x?.fee.total) continue;
    const mine = d.items.filter((i) => tobacco.has(i.productId));
    const share = x.all
      ? mine.reduce((a, i) => a + w(i), 0) / x.all
      : mine.length / (x.count || 1);
    out.set(d.id, {
      net: x.fee.net * share,
      tax: x.fee.tax * share,
      total: x.fee.total * share,
    });
  }
  return out;
}

// إجمالي كل رسوم في الفواتير (شامل الضريبة، والمرتجع بالسالب)
export async function restaurantFeeTotals(saleWhere) {
  if (!(await hasModule("restaurant"))) return null;
  const ids = await restaurantFeeProducts();
  const list = Object.values(ids).filter(Boolean);
  const out = { service: 0, delivery: 0, tobacco: 0 };
  if (!list.length) return out;
  const lines = await prisma.saleItem.findMany({
    where: { productId: { in: list }, sale: saleWhere },
    select: { productId: true, totalAmount: true, sale: { select: { type: true } } },
  });
  for (const l of lines) {
    const kind = Object.keys(ids).find((k) => ids[k] === l.productId);
    if (kind) out[kind] += docSign(l.sale.type) * n(l.totalAmount);
  }
  return { service: r2(out.service), delivery: r2(out.delivery), tobacco: r2(out.tobacco) };
}

// القسم الرئيسي + كل الأقسام اللي تحته (فلتر «المجموعة الرئيسية»)
export async function categoryWithChildren(categoryId) {
  if (!categoryId) return null;
  const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const ids = new Set([categoryId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of all)
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
  }
  return [...ids];
}

// تقرير التبغ (وحدة restaurant): أصناف التبغ المباعة ورسوم التبغ
// - الأصناف: الكمية والإجمالي لكل صنف تبغ (صافي بعد المرتجع)
// - الفواتير: كل فاتورة فيها تبغ بكمية التبغ وقيمته ورسومه
// - رسوم كل صنف: رسوم الفاتورة متوزعة على أصناف التبغ فيها
//   (بالكمية لو الرسوم مبلغ لكل وحدة، وبالقيمة لو نسبة)
export async function tobaccoReport(f, user) {
  const h = await getDayStartHour();
  const saleWhere = {
    ...dateRange(f, h),
    ...reportBranch(user, f.branchId),
    ...(f.userId ? { createdById: f.userId } : {}),
  };
  const [{ tobacco: feeId }, tobaccoItems, feeSettings] = await Promise.all([
    restaurantFeeProducts(),
    prisma.restaurantItem.findMany({
      where: { isTobacco: true },
      select: { productId: true },
    }),
    prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { restaurantTobaccoType: true },
    }),
  ]);
  const byQty = feeSettings?.restaurantTobaccoType === "amount";
  const itemIds = tobaccoItems.map((i) => i.productId);
  const ids = [...itemIds, ...(feeId ? [feeId] : [])];
  if (!ids.length)
    return { products: [], invoices: [], totals: { qty: 0, sales: 0, fees: 0, total: 0, invoices: 0 } };
  const lines = await prisma.saleItem.findMany({
    where: { productId: { in: ids }, sale: saleWhere },
    orderBy: { id: "asc" },
    take: MAX_ROWS * 4,
    select: {
      productId: true,
      arName: true,
      enName: true,
      code: true,
      qty: true,
      totalAmount: true,
      sale: {
        select: {
          id: true,
          type: true,
          number: true, docCode: true,
          date: true,
          customerArName: true,
          customerEnName: true,
          branch: branchSelect,
        },
      },
    },
  });
  const products = new Map();
  const invoices = new Map();
  for (const l of lines) {
    const sign = docSign(l.sale.type);
    const inv = invoices.get(l.sale.id) ?? {
      id: l.sale.id,
      type: l.sale.type,
      docNo: saleDocNo(l.sale.type, l.sale.number, l.sale.docCode),
      date: l.sale.date,
      customerArName: l.sale.customerArName,
      customerEnName: l.sale.customerEnName,
      branch: l.sale.branch,
      qty: 0,
      sales: 0,
      fees: 0,
      // أصناف التبغ في الفاتورة (لتوزيع الرسوم)
      items: new Map(),
    };
    if (l.productId === feeId) inv.fees += sign * n(l.totalAmount);
    else {
      inv.qty += sign * n(l.qty);
      inv.sales += sign * n(l.totalAmount);
      const p = products.get(l.productId) ?? {
        productId: l.productId,
        code: l.code,
        arName: l.arName,
        enName: l.enName,
        qty: 0,
        sales: 0,
        fees: 0,
      };
      p.qty += sign * n(l.qty);
      p.sales += sign * n(l.totalAmount);
      products.set(l.productId, p);
      const it = inv.items.get(l.productId) ?? { qty: 0, sales: 0 };
      it.qty += n(l.qty);
      it.sales += n(l.totalAmount);
      inv.items.set(l.productId, it);
    }
    invoices.set(l.sale.id, inv);
  }
  // توزيع رسوم كل فاتورة على أصنافها (الوزن: الكمية أو القيمة، ولو صفر يتوزع بالتساوي)
  for (const inv of invoices.values()) {
    if (!inv.fees || !inv.items.size) continue;
    const parts = [...inv.items.entries()];
    const w = (x) => (byQty ? x.qty : x.sales);
    const all = parts.reduce((s, [, x]) => s + w(x), 0);
    for (const [pid, x] of parts) {
      const share = all ? w(x) / all : 1 / parts.length;
      products.get(pid).fees += inv.fees * share;
    }
  }
  const invList = [...invoices.values()].map((i) => ({
    ...i,
    items: undefined,
    qty: round(i.qty, 3),
    sales: r2(i.sales),
    fees: r2(i.fees),
    total: r2(i.sales + i.fees),
  }));
  const prodList = [...products.values()]
    .map((p) => ({
      ...p,
      qty: round(p.qty, 3),
      sales: r2(p.sales),
      fees: r2(p.fees),
      total: r2(p.sales + p.fees),
    }))
    .sort((a, b) => b.sales - a.sales);
  const sum = (k) => r2(invList.reduce((s, i) => s + i[k], 0));
  return {
    products: prodList,
    invoices: invList,
    totals: {
      invoices: invList.filter((i) => i.type !== "return").length,
      qty: round(invList.reduce((s, i) => s + i.qty, 0), 3),
      sales: sum("sales"),
      fees: sum("fees"),
      total: sum("total"),
    },
  };
}
