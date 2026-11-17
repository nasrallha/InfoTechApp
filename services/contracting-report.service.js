import "server-only";
import { prisma } from "@/lib/prisma";
import { assertModule } from "@/lib/modules";
import { round } from "@/lib/invoice-calc";
import { dayToDbDate, today } from "@/lib/dates";
import { advanceBalance } from "@/lib/contracting";
import { MODULE, branchScope, contractDocNo, day, n } from "./contracting.service";

// ============================================================
// تقارير المقاولات
// - موقف العقود: القيمة والمنفّذ ونسبة الإنجاز والدفعة المقدمة والضمان والمحصّل والمستحق
// - الضمانات المحجوزة: الباقي على كل عقد وموعد الإفراج (المتأخر بالأحمر)
// ============================================================

const SELECT = {
  id: true,
  number: true,
  docCode: true,
  kind: true,
  projectName: true,
  projectLocation: true,
  status: true,
  signDate: true,
  endDate: true,
  taxRate: true,
  advancePct: true,
  recoveryPct: true,
  retentionPct: true,
  retentionReleaseDate: true,
  totalAmount: true,
  advanceAmount: true,
  priorAdvance: true,
  parentId: true,
  customer: { select: { arName: true, enName: true } },
  supplier: { select: { arName: true, enName: true } },
  advanceSale: { select: { totalAmount: true } },
  advancePurchase: { select: { totalAmount: true } },
  certificates: {
    where: { cancelled: false },
    select: { gross: true, recovery: true, retention: true, penalty: true, invoiceTotal: true },
  },
  payments: { select: { kind: true, amount: true } },
};

// موقف عقد واحد (نفس حساب شاشة العقد)
function positionOf(c) {
  const r = (v) => round(v, 2);
  const sum = (key) => r(c.certificates.reduce((s, x) => s + n(x[key]), 0));
  const advanceDoc = c.advanceSale ?? c.advancePurchase;
  const certified = sum("gross");
  const recovered = sum("recovery");
  const retentionHeld = sum("retention");
  const retentionReleased = r(
    c.payments.filter((p) => p.kind === "retention").reduce((s, p) => s + n(p.amount), 0),
  );
  const penalties = sum("penalty");
  const invoiced = r(sum("invoiceTotal") + n(advanceDoc?.totalAmount));
  const collected = r(c.payments.reduce((s, p) => s + n(p.amount), 0));
  const total = n(c.totalAmount);
  return {
    id: c.id,
    docNo: contractDocNo(c),
    kind: c.kind,
    projectName: c.projectName,
    projectLocation: c.projectLocation,
    status: c.status,
    party: c.customer ?? c.supplier,
    signDate: day(c.signDate),
    endDate: day(c.endDate),
    taxRate: n(c.taxRate),
    // القيمة شامل الضريبة + النسب (ملخص المشاريع)
    totalWithTax: r(total * (1 + n(c.taxRate) / 100)),
    advancePct: n(c.advancePct),
    recoveryPct: n(c.recoveryPct),
    retentionPct: n(c.retentionPct),
    certCount: c.certificates.length,
    retentionReleaseDate: day(c.retentionReleaseDate),
    totalAmount: total,
    certified,
    progress: total > 0 ? Math.min(100, Math.round((certified / total) * 1000) / 10) : 0,
    advanceAmount: n(c.advanceAmount),
    advanceLeft: advanceBalance({
      advanceIssued: Boolean(advanceDoc),
      advanceAmount: c.advanceAmount,
      priorAdvance: c.priorAdvance,
      recovered,
    }),
    retentionLeft: r(retentionHeld - retentionReleased),
    penalties,
    invoiced,
    collected,
    due: r(invoiced - penalties - collected),
    parentId: c.parentId,
  };
}

export async function contractingReport({ tab = "position", kind = "owner", status = "active", year = null, q = "" }, user) {
  await assertModule(MODULE);
  const text = String(q ?? "").trim();
  const where = {
    ...branchScope(user),
    ...(tab === "retentions" ? {} : { isDirect: false }),
    ...(tab === "position" ? { kind } : {}),
    // ملخص المشاريع: عقود المالك، بسنة التوقيع (اختياري) واسم المالك / المشروع / المكان
    ...(tab === "summary"
      ? {
          kind: "owner",
          ...(year
            ? { signDate: { gte: dayToDbDate(`${year}-01-01`), lte: dayToDbDate(`${year}-12-31`) } }
            : {}),
          ...(text
            ? {
                OR: [
                  { projectName: { contains: text } },
                  { projectLocation: { contains: text } },
                  { customer: { arName: { contains: text } } },
                ],
              }
            : {}),
        }
      : {}),
    ...(status && status !== "all" ? { status } : {}),
  };
  const rows = (
    await prisma.constructionContract.findMany({ where, orderBy: { id: "desc" }, select: SELECT })
  ).map(positionOf);

  if (tab === "retentions") {
    const now = today();
    const list = rows
      .filter((x) => x.retentionLeft > 0.004)
      .map((x) => ({ ...x, overdue: Boolean(x.retentionReleaseDate && x.retentionReleaseDate < now) }))
      .sort((a, b) => (a.retentionReleaseDate ?? "9999").localeCompare(b.retentionReleaseDate ?? "9999"));
    return { tab, rows: list };
  }

  if (tab === "summary") {
    const totals = { count: rows.length };
    for (const k of ["totalAmount", "totalWithTax", "certified", "invoiced", "collected", "retentionLeft", "due"])
      totals[k] = round(rows.reduce((s, x) => s + x[k], 0), 2);
    totals.progress = totals.totalAmount > 0 ? Math.round((totals.certified / totals.totalAmount) * 1000) / 10 : 0;
    // سنين التوقيع المتاحة (الفلتر)
    const years = await prisma.constructionContract.findMany({
      where: { ...branchScope(user), isDirect: false, kind: "owner" },
      select: { signDate: true },
    });
    return {
      tab,
      rows,
      totals,
      years: [...new Set(years.map((y) => Number(day(y.signDate).slice(0, 4))))].sort((a, b) => b - a),
    };
  }

  // موقف العقود + الإجماليات
  const totals = {};
  for (const k of ["totalAmount", "certified", "advanceLeft", "retentionLeft", "penalties", "invoiced", "collected", "due"])
    totals[k] = round(rows.reduce((s, x) => s + x[k], 0), 2);
  return { tab, rows, totals };
}
