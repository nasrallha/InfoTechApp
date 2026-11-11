import "server-only";
import { claimCounters } from "./warranty-claim.service";
import { visitCounters } from "./maintenance-contract.service";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { round } from "@/lib/invoice-calc";
import { bizDayOf, bizRange, bizToday } from "@/lib/business-day";
import { getDayStartHour } from "@/lib/business-day-server";
import { docSign, saleDocNo, formatDocNo } from "@/lib/doc-number";
import { dailyReport, reportBranch, topProducts } from "./report.service";
import { shiftSummary } from "./shift.service";
import { getZatcaAlerts } from "./zatca-invoice.service";

// ============================================================
// الصفحة الرئيسية (لوحة المتابعة)
// كل جزء يُحسب فقط لو المستخدم يملك صلاحيته:
// - dashboard.finance: أرقام اليوم والشهر، فلوس اليوم، الرسوم، أكثر الأصناف
// - sales.pos: ورديتي (والمفروض في الدرج بصلاحية shifts.viewExpected)
// - sales.view: آخر الفواتير
// - shifts.view: الورديات المفتوحة الآن
// - stock.view: الأصناف الناقصة
// (بدون المديونيات حسب طلب العميل)
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => round(v, 2);
const LOW_STOCK = 5;

const addDays = (day, days) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const addMonths = (day, months) => {
  const d = new Date(`${day.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};
// الفترة بأيام العمل (h = بداية يوم العمل)
const range = (from, to, h = 0) => ({ date: bizRange({ from, to }, h) });
// نسبة التغيير (null لو مفيش أساس للمقارنة)
const change = (now, before) =>
  before > 0 ? r2(((now - before) / before) * 100) : null;

const userSelect = { select: { id: true, arFullname: true, enFullname: true } };
// رقم الوردية + ترتيبها في يوم العمل: SH-124 (2)
const shiftDocNo = (s) =>
  `${formatDocNo("shift", s.number, s.docCode)}${s.dayNo ? ` (${s.dayNo})` : ""}`;

export async function dashboardData(user) {
  const branch = reportBranch(user, null);
  const finance = can(user, "dashboard.finance");
  // النهارده = يوم العمل الحالي (حسب بداية يوم العمل)
  const h = await getDayStartHour();
  const now = bizToday(h);

  const [
    counts,
    shift,
    recentSales,
    openShifts,
    lowStock,
    money,
    zatca,
    claims,
    visits,
  ] = await Promise.all([
    getCounts(),
    can(user, "sales.pos") ? myShift(user) : null,
    can(user, "sales.view") ? lastSales(branch) : null,
    can(user, "shifts.view") ? currentShifts(user, branch) : null,
    can(user, "stock.view") ? lowStockItems(branch) : null,
    finance ? todayMoney(user, now) : null,
    can(user, "zatca.view") ? getZatcaAlerts(user).catch(() => null) : null,
    // طلبات الضمان والصيانة: جاهز للتسليم + متأخر عند الوكيل
    can(user, "warrantyClaims.view")
      ? claimCounters(user).catch(() => null)
      : null,
    // زيارات عقود الصيانة: المتأخرة + خلال 7 أيام
    can(user, "maintenanceContracts.view")
      ? visitCounters(user).catch(() => null)
      : null,
  ]);

  const base = {
    finance,
    counts,
    shift,
    recentSales,
    openShifts,
    lowStock,
    zatca,
    claims,
    visits,
  };
  if (!finance) return base;
  return { ...base, money, ...(await salesFigures(branch, now, h)) };
}

// الأعداد (شريط صغير في آخر الصفحة)
async function getCounts() {
  const [categories, products, customers, suppliers, users] = await Promise.all(
    [
      prisma.category.count(),
      prisma.product.count(),
      prisma.customer.count(),
      prisma.supplier.count(),
      prisma.user.count({ where: { isOwner: false } }),
    ],
  );
  return { categories, products, customers, suppliers, users };
}

// ورديتي المفتوحة (المفروض في الدرج يظهر بصلاحية فقط: العدّ الأعمى)
async function myShift(user) {
  const shift = await prisma.shift.findFirst({
    where: { userId: user.id, status: "open" },
    orderBy: { id: "desc" },
    select: {
      id: true,
      number: true, docCode: true,
      openedAt: true,
      openingCash: true,
      branch: { select: { arName: true, enName: true } },
      dayNo: true,
      _count: { select: { sales: true } },
    },
  });
  if (!shift) return { open: false };
  const canSee = can(user, "shifts.viewExpected");
  const summary = canSee ? await shiftSummary(shift.id) : null;
  return {
    open: true,
    id: shift.id,
    docNo: shiftDocNo(shift),
    openedAt: shift.openedAt,
    branch: shift.branch,
    invoices: shift._count.sales,
    expectedCash: summary ? summary.expectedCash : null,
  };
}

// آخر 8 فواتير بيع/مرتجع
async function lastSales(branch) {
  const rows = await prisma.sale.findMany({
    where: { ...branch },
    orderBy: { id: "desc" },
    take: 8,
    select: {
      id: true,
      type: true,
      number: true, docCode: true,
      source: true,
      date: true,
      customerArName: true,
      customerEnName: true,
      totalAmount: true,
      createdBy: userSelect,
    },
  });
  return rows.map((r) => ({
    ...r,
    totalAmount: n(r.totalAmount),
    docNo: saleDocNo(r.type, r.number, r.docCode),
  }));
}

// الورديات المفتوحة الآن
async function currentShifts(user, branch) {
  const rows = await prisma.shift.findMany({
    where: { status: "open", ...branch },
    orderBy: { openedAt: "asc" },
    take: 10,
    select: {
      id: true,
      number: true, docCode: true,
      openedAt: true,
      user: userSelect,
      branch: { select: { arName: true, enName: true } },
      dayNo: true,
      _count: { select: { sales: true } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    docNo: shiftDocNo(s),
    openedAt: s.openedAt,
    user: s.user,
    branch: s.branch,
    invoices: s._count.sales,
  }));
}

// الأصناف النشطة اللي رصيدها خلص أو قرّب يخلص (5 أو أقل بالوحدة الأساسية)
async function lowStockItems(branch) {
  const [balances, active] = await Promise.all([
    prisma.stockBalance.groupBy({
      by: ["productId"],
      // بدون صلاحية كل الفروع: مستودع الفرع فقط
      where: branch.branchId
        ? { warehouse: { branches: { some: { id: branch.branchId } } } }
        : {},
      _sum: { qty: true },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        arName: true,
        enName: true,
        baseUnit: { select: { arName: true, enName: true } },
      },
    }),
  ]);
  const balanceOf = new Map(balances.map((b) => [b.productId, n(b._sum.qty)]));
  const low = active
    .map((p) => ({ ...p, qty: round(balanceOf.get(p.id) ?? 0, 3) }))
    .filter((p) => p.qty <= LOW_STOCK)
    .sort((a, b) => a.qty - b.qty);
  return {
    count: low.length,
    outOfStock: low.filter((p) => p.qty <= 0).length,
    items: low.slice(0, 8),
    threshold: LOW_STOCK,
  };
}

// فلوس النهارده حسب طريقة الدفع (كاش / شبكة / تحويل) — نفس حساب تقرير اليومية
async function todayMoney(user, now) {
  const d = await dailyReport({ from: now, to: now }, user);
  return {
    methods: d.methods.map((m) => ({
      id: m.id,
      arName: m.arName,
      enName: m.enName,
      type: m.type,
      net: m.net,
    })),
    total: d.totals.net,
  };
}

// المبيعات والأرباح: النهارده مقابل إمبارح، الشهر مقابل نفس الفترة من الشهر اللي فات،
// آخر 30 يوم، آخر 12 شهر، طرق الدفع وأكثر الأصناف هذا الشهر
async function salesFigures(branch, now, h) {
  const monthStart = `${now.slice(0, 7)}-01`;
  const yearStart = addMonths(now, -11);
  const yesterday = addDays(now, -1);
  const prevMonthStart = addMonths(now, -1);
  // نفس عدد الأيام من الشهر اللي فات (لو الشهر اللي فات أقصر ناخد آخره)
  const dayOfMonth = Number(now.slice(8, 10));
  const prevLast = new Date(
    Date.UTC(
      Number(prevMonthStart.slice(0, 4)),
      Number(prevMonthStart.slice(5, 7)),
      0,
    ),
  ).getUTCDate();
  const prevMonthTo = `${prevMonthStart.slice(0, 7)}-${String(
    Math.min(dayOfMonth, prevLast),
  ).padStart(2, "0")}`;
  const from30 = addDays(now, -29);

  const sales = await prisma.sale.findMany({
    where: {
      ...range(yearStart < from30 ? yearStart : from30, now, h),
      ...branch,
    },
    select: {
      type: true,
      date: true,
      totalAmount: true,
      netAmount: true,
      costAmount: true,
    },
  });

  const days = new Map();
  for (let i = 0; i < 30; i++) {
    const k = addDays(from30, i);
    days.set(k, { key: k, sales: 0, profit: 0 });
  }
  const months = new Map();
  for (let i = 0; i < 12; i++) {
    const k = addMonths(yearStart, i).slice(0, 7);
    months.set(k, { key: k, sales: 0, profit: 0 });
  }
  const t = {
    today: 0,
    todayCount: 0,
    yesterday: 0,
    month: 0,
    monthProfit: 0,
    monthNet: 0,
    prev: 0,
  };

  for (const s of sales) {
    const sign = docSign(s.type);
    const day = bizDayOf(s.date, h);
    const total = sign * n(s.totalAmount);
    const net = sign * n(s.netAmount);
    const profit = sign * (n(s.netAmount) - n(s.costAmount));
    const d = days.get(day);
    if (d) {
      d.sales += total;
      d.profit += profit;
    }
    const m = months.get(day.slice(0, 7));
    if (m) {
      m.sales += total;
      m.profit += profit;
    }
    if (day === now) {
      t.today += total;
      if (sign > 0) t.todayCount++;
    }
    if (day === yesterday) t.yesterday += total;
    if (day >= monthStart) {
      t.month += total;
      t.monthNet += net;
      t.monthProfit += profit;
    }
    if (day >= prevMonthStart && day <= prevMonthTo) t.prev += total;
  }

  const monthWhere = { ...range(monthStart, now, h), ...branch };
  const [payments, top] = await Promise.all([
    prisma.salePayment.findMany({
      where: { sale: { ...monthWhere, type: "sale" } },
      select: {
        amount: true,
        paymentMethod: {
          select: { id: true, arName: true, enName: true, type: true },
        },
      },
    }),
    topProducts(monthWhere, 5),
  ]);
  const byMethod = new Map();
  for (const p of payments) {
    const m = byMethod.get(p.paymentMethod.id) ?? {
      ...p.paymentMethod,
      amount: 0,
    };
    m.amount += n(p.amount);
    byMethod.set(p.paymentMethod.id, m);
  }
  const fix = (list) =>
    list.map((x) => ({ ...x, sales: r2(x.sales), profit: r2(x.profit) }));

  return {
    today: {
      sales: r2(t.today),
      count: t.todayCount,
      avg: t.todayCount ? r2(t.today / t.todayCount) : 0,
      yesterday: r2(t.yesterday),
      change: change(t.today, t.yesterday),
    },
    month: {
      sales: r2(t.month),
      profit: r2(t.monthProfit),
      margin: t.monthNet ? r2((t.monthProfit / t.monthNet) * 100) : 0,
      prev: r2(t.prev),
      change: change(t.month, t.prev),
    },
    days: fix([...days.values()]),
    months: fix([...months.values()]),
    methods: [...byMethod.values()].map((m) => ({
      ...m,
      amount: r2(m.amount),
    })),
    topProducts: top,
  };
}
