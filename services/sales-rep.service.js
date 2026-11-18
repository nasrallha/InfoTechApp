import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule, hasModule } from "@/lib/modules";
import { can, userPermissions } from "@/lib/permissions";
import { round } from "@/lib/invoice-calc";
import { bizRange } from "@/lib/business-day";
import { getDayStartHour } from "@/lib/business-day-server";
import { isSalesRep, REP_PERMISSION } from "@/lib/sales-reps";

// ============================================================
// المناديب والعمولات (وحدة salesReps)
// - المندوب = مستخدم دوره (أو استثناءاته) فيه صلاحية salesReps.rep
// - نسبته في users.commissionRate (بتتكتب من شاشة المستخدم أو من التقرير)
// - الفاتورة / عرض السعر: salesRepId (ممكن يختلف عن اللي عمل المستند)
//   الافتراضي = المستخدم نفسه لو مندوب، والتغيير بصلاحية salesReps.assign
// - المرتجع: مندوب الفاتورة الأصلية
// - العمولة = (صافي المبيعات - صافي المرتجعات، من غير الضريبة) × النسبة
// ============================================================

const MODULE = "salesReps";
const MAX_DOCS = 5000;

const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => round(v, 2);

// المناديب النشطين (للاختيار في الفاتورة والتقرير)
// includeIds: مناديب لازم يظهروا حتى لو اتوقفوا (مندوب فاتورة قديمة)
export async function listSalesReps({ includeIds = [] } = {}) {
  if (!(await hasModule(MODULE))) return [];
  const users = await prisma.user.findMany({
    where: {
      isOwner: false,
      OR: [{ isActive: true }, { id: { in: includeIds } }],
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      arFullname: true,
      enFullname: true,
      isActive: true,
      commissionRate: true,
      grantedPermissions: true,
      revokedPermissions: true,
      role: {
        select: {
          permissions: {
            where: { permission: REP_PERMISSION },
            select: { permission: true },
          },
        },
      },
    },
  });
  return users
    .filter(
      (u) =>
        includeIds.includes(u.id) ||
        userPermissions(
          u.role.permissions.map((p) => p.permission),
          u.grantedPermissions,
          u.revokedPermissions,
        ).includes(REP_PERMISSION),
    )
    .map((u) => ({
      id: u.id,
      arName: u.arFullname,
      enName: u.enFullname,
      isActive: u.isActive,
      commissionRate: n(u.commissionRate),
    }));
}

// مندوب المستند وقت الحفظ
// wanted: المختار في الشاشة (undefined = مااتبعتش: الكاشير / المطعم ...)
// existing: المستند القديم (التعديل)، fallback: مندوب عرض السعر (التحويل)
export async function resolveSalesRep(wanted, user, { existing = null, fallback = null } = {}) {
  const on = await hasModule(MODULE);
  // الوحدة مقفولة: المستند بيفضل زي ما هو
  if (!on) return existing?.salesRepId ?? null;
  const def = existing
    ? (existing.salesRepId ?? null)
    : (fallback ?? (isSalesRep(user) ? user.id : null));
  if (wanted === undefined || !can(user, "salesReps.assign")) return def;
  if (wanted === null || wanted === def) return wanted;
  const reps = await listSalesReps();
  if (!reps.some((r) => r.id === wanted))
    throw new AppError("SalesRepInvalid", null, { salesRepId: "SalesRepInvalid" });
  return wanted;
}

// ------------------------------------------------------------
// تقرير عمولات المناديب
// filters: { from, to, fromTime, toTime, branchId, salesRepId }
// ------------------------------------------------------------
export async function salesRepsReport(f, user) {
  await assertModule(MODULE);
  const h = await getDayStartHour();
  const allBranches = can(user, "allBranches.view");
  const docs = await prisma.sale.findMany({
    where: {
      salesRepId: f.salesRepId ?? { not: null },
      date: bizRange(f, h),
      ...(allBranches
        ? f.branchId
          ? { branchId: f.branchId }
          : {}
        : { branchId: user.branch.id }),
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: MAX_DOCS,
    select: {
      id: true,
      type: true,
      number: true,
      docCode: true,
      date: true,
      customerArName: true,
      customerEnName: true,
      netAmount: true,
      totalAmount: true,
      salesRepId: true,
      createdBy: { select: { id: true, arFullname: true, enFullname: true } },
    },
  });
  const ids = [...new Set(docs.map((d) => d.salesRepId))];
  const reps = await listSalesReps({ includeIds: ids });
  const byId = new Map(reps.map((r) => [r.id, r]));

  // كل مندوب (حتى اللي مالوش مبيعات في الفترة، لو مش مختار مندوب معين)
  const wanted = f.salesRepId
    ? [byId.get(f.salesRepId)].filter(Boolean)
    : reps.filter((r) => r.isActive || ids.includes(r.id));
  const rows = wanted.map((rep) => {
    const own = docs.filter((d) => d.salesRepId === rep.id);
    const sales = own.filter((d) => d.type === "sale");
    const returns = own.filter((d) => d.type === "return");
    const salesNet = r2(sales.reduce((s, d) => s + n(d.netAmount), 0));
    const returnsNet = r2(returns.reduce((s, d) => s + n(d.netAmount), 0));
    const net = r2(salesNet - returnsNet);
    return {
      ...rep,
      invoices: sales.length,
      returns: returns.length,
      salesNet,
      returnsNet,
      net,
      commission: r2((net * rep.commissionRate) / 100),
      docs: own.map((d) => ({
        id: d.id,
        type: d.type,
        number: d.number,
        docCode: d.docCode,
        date: d.date,
        customerArName: d.customerArName,
        customerEnName: d.customerEnName,
        netAmount: n(d.netAmount),
        totalAmount: n(d.totalAmount),
        seller: d.createdBy
          ? { id: d.createdBy.id, arName: d.createdBy.arFullname, enName: d.createdBy.enFullname }
          : null,
      })),
    };
  });
  const sum = (k) => r2(rows.reduce((s, r) => s + r[k], 0));
  return {
    rows,
    totals: {
      invoices: rows.reduce((s, r) => s + r.invoices, 0),
      salesNet: sum("salesNet"),
      returnsNet: sum("returnsNet"),
      net: sum("net"),
      commission: sum("commission"),
    },
    truncated: docs.length >= MAX_DOCS,
  };
}

// حفظ نسبة المندوب (من التقرير أو شاشة المستخدم)
// (غير مدير النظام: مناديب فرعه بس، زي شاشة المستخدمين)
export async function setRepRate({ userId, rate }, user) {
  await assertModule(MODULE);
  const reps = await listSalesReps();
  if (!reps.some((r) => r.id === userId)) throw new AppError("SalesRepInvalid");
  if (!user.isSuper && !user.isOwner) {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { branchId: true } });
    if (target?.branchId !== user.branch.id) throw new AppError("Forbidden");
  }
  await prisma.user.update({
    where: { id: userId },
    data: { commissionRate: rate },
  });
  return { userId, rate };
}
