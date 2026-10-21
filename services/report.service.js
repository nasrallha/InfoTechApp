import "server-only";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { round } from "@/lib/invoice-calc";
import { dayEnd, dayOf, dayStart, today } from "@/lib/dates";
import { formatDocNo, parseDocNo, saleDocNo } from "@/lib/doc-number";

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

const dateRange = ({ from, to }) => ({
  date: {
    ...(from ? { gte: dayStart(from) } : {}),
    ...(to ? { lte: dayEnd(to) } : {}),
  },
});

const monthOf = (date) => dayOf(date).slice(0, 7);

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
          orderBy: { code: "asc" },
          select: { id: true, code: true, arName: true, enName: true },
        })
      : null,
    parties.includes("supplier")
      ? prisma.supplier.findMany({
          orderBy: { code: "asc" },
          select: { id: true, code: true, arName: true, enName: true },
        })
      : null,
  ]);
  return { branches, users, methods, customers, suppliers };
}

// ------------------------------------------------------------
// تقرير المبيعات (الفواتير والمرتجعات)
// ------------------------------------------------------------
export async function salesReport(f, user) {
  const num = f.q ? parseDocNo(f.q) : null;
  const where = {
    ...dateRange(f),
    ...reportBranch(user, f.branchId),
    ...(f.userId ? { createdById: f.userId } : {}),
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(f.source ? { source: f.source } : {}),
    ...(f.paymentMethodId
      ? { payments: { some: { paymentMethodId: f.paymentMethodId } } }
      : {}),
    ...(num ? { number: num } : {}),
  };
  const showProfit = can(user, "reports.profit");
  const docs = await prisma.sale.findMany({
    where,
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: MAX_ROWS,
    select: {
      id: true,
      type: true,
      number: true,
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
    },
  });

  const t = {
    sales: 0,
    salesCount: 0,
    returns: 0,
    returnsCount: 0,
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

  const rows = docs.map((d) => {
    const sign = d.type === "return" ? -1 : 1;
    const net = n(d.netAmount);
    const cost = n(d.costAmount);
    if (sign > 0) {
      t.sales += n(d.totalAmount);
      t.salesCount++;
    } else {
      t.returns += n(d.totalAmount);
      t.returnsCount++;
    }
    t.net += sign * net;
    t.tax += sign * n(d.taxAmount);
    t.total += sign * n(d.totalAmount);
    t.discount += sign * (n(d.itemsDiscount) + n(d.invoiceDiscount));
    t.cost += sign * cost;
    t.credit += sign * n(d.remainingAmount);
    for (const p of d.payments) {
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
    c.count += sign > 0 ? 1 : 0;
    c.total += sign * n(d.totalAmount);
    cashiers.set(d.createdBy.id, c);
    const key = byMonth ? monthOf(d.date) : dayOf(d.date);
    const b = chart.get(key);
    if (b) {
      if (sign > 0) b.sales += n(d.totalAmount);
      else b.returns += n(d.totalAmount);
      b.profit += sign * (net - cost);
    }
    return {
      id: d.id,
      type: d.type,
      docNo: saleDocNo(d.type, d.number),
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
  const num = f.q ? parseDocNo(f.q) : null;
  const where = {
    ...dateRange(f),
    ...reportBranch(user, f.branchId),
    ...(f.userId ? { createdById: f.userId } : {}),
    ...(f.supplierId ? { supplierId: f.supplierId } : {}),
    ...(f.paymentMethodId
      ? { payments: { some: { paymentMethodId: f.paymentMethodId } } }
      : {}),
    ...(num ? { number: num } : {}),
  };
  const docs = await prisma.purchase.findMany({
    where,
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: MAX_ROWS,
    select: {
      id: true,
      type: true,
      number: true,
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
    const sign = d.type === "return" ? -1 : 1;
    if (sign > 0) {
      t.purchases += n(d.totalAmount);
      t.purchasesCount++;
    } else {
      t.returns += n(d.totalAmount);
      t.returnsCount++;
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
    s.count += sign > 0 ? 1 : 0;
    s.total += sign * n(d.totalAmount);
    suppliers.set(sKey, s);
    const b = chart.get(byMonth ? monthOf(d.date) : dayOf(d.date));
    if (b) {
      if (sign > 0) b.purchases += n(d.totalAmount);
      else b.returns += n(d.totalAmount);
    }
    return {
      id: d.id,
      type: d.type,
      docNo: formatDocNo(d.type === "return" ? "return" : "purchase", d.number),
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
  const out = {
    sales: blank(),
    returns: blank(),
    standard: blank(),
    simplified: blank(),
  };
  const inp = { purchases: blank(), returns: blank() };
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
    if (d.type === "return") {
      add(out.returns, d);
      m.outputTax -= n(d.taxAmount);
      m.salesNet -= n(d.netAmount);
    } else {
      add(out.sales, d);
      add(d.customerTaxNo ? out.standard : out.simplified, d);
      m.outputTax += n(d.taxAmount);
      m.salesNet += n(d.netAmount);
    }
  }
  for (const d of purchases) {
    const m = month(d);
    if (d.type === "return") {
      add(inp.returns, d);
      m.inputTax -= n(d.taxAmount);
      m.purchasesNet -= n(d.netAmount);
    } else {
      add(inp.purchases, d);
      m.inputTax += n(d.taxAmount);
      m.purchasesNet += n(d.netAmount);
    }
  }
  const fix = (b) => ({
    count: b.count,
    net: r2(b.net),
    tax: r2(b.tax),
    total: r2(b.total),
  });
  const outputTax = out.sales.tax - out.returns.tax;
  const inputTax = inp.purchases.tax - inp.returns.tax;
  return {
    output: {
      sales: fix(out.sales),
      returns: fix(out.returns),
      standard: fix(out.standard),
      simplified: fix(out.simplified),
      netSales: r2(out.sales.net - out.returns.net),
      tax: r2(outputTax),
    },
    input: {
      purchases: fix(inp.purchases),
      returns: fix(inp.returns),
      netPurchases: r2(inp.purchases.net - inp.returns.net),
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
export async function profitReport(f, user) {
  const branch = reportBranch(user, f.branchId);
  const range = dateRange(f);
  const saleWhere = { ...range, ...branch };
  const [sales, vouchers] = await Promise.all([
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
  ]);

  const { byMonth, keys } = buckets(f.from, f.to);
  const chart = new Map(
    keys.map((k) => [k, { key: k, revenue: 0, cost: 0, gross: 0, net: 0 }]),
  );
  const bucketOf = (date) => chart.get(byMonth ? monthOf(date) : dayOf(date));

  let salesNet = 0;
  let returnsNet = 0;
  let salesCost = 0;
  let returnsCost = 0;
  for (const s of sales) {
    const b = bucketOf(s.date);
    if (s.type === "return") {
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
  const revenue = salesNet - returnsNet;
  const cost = salesCost - returnsCost;
  const gross = revenue - cost;
  const totalExpenses = [...expenses.values()].reduce(
    (s, e) => s + e.amount,
    0,
  );
  const net = gross - allowed + received - totalExpenses + otherIncome;

  return {
    salesNet: r2(salesNet),
    returnsNet: r2(returnsNet),
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
export async function dailyReport(f, user) {
  const branch = reportBranch(user, f.branchId);
  const range = dateRange(f);
  const byUser = f.userId ? { createdById: f.userId } : {};
  const nonCredit = { paymentMethod: { type: { not: "credit" } } };

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
          number: true,
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
          shift: { select: { number: true } },
        },
      }),
      prisma.shift.findMany({
        where: {
          status: "closed",
          closedAt: range.date,
          ...branch,
          ...(f.userId ? { userId: f.userId } : {}),
        },
        orderBy: { closedAt: "asc" },
        select: {
          id: true,
          number: true,
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
        where: { type: { not: "credit" } },
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
    if (p.sale.type === "return") r.salesReturns += n(p.amount);
    else r.sales += n(p.amount);
  }
  for (const p of purchasePays) {
    const r = rows.get(p.paymentMethodId);
    if (!r) continue;
    if (p.purchase.type === "return") r.purchaseReturns += n(p.amount);
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

  const sum = (k) => r2(list.reduce((s, r) => s + r[k], 0));
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
      docNo: formatDocNo(v.type, v.number),
      method: methods.find((m) => m.id === v.paymentMethodId) ?? null,
    })),
    movements: movements.map((m) => ({ ...m, amount: n(m.amount) })),
    shifts,
  };
}
