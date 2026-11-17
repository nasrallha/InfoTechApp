import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { dayOf, dayToDbDate, dbDateToDay, today } from "@/lib/dates";
import { splitDocCode } from "@/lib/doc-number";

// ============================================================
// السنوات المالية
// - كل مستند مترقّم بياخد سنته المالية من تاريخه، ورقمه من تسلسل السنة دي (DM-SI-2026-15)
// - السنة بتتعمل أوتوماتيك مع أول مستند بتاريخ فيها، من «بداية السنة المالية» (الشهر)
//   code = السنة اللي بتبدأ فيها (يوليو 2026 - يونيو 2027 ← 2026)
// - المقفلة: مفيش مستندات جديدة بتاريخ فيها
//   (الإقفال المحاسبي الكامل وترحيل الأرصدة: مع الشجرة المحاسبية)
// - الصلاحيات: fiscalYears.view عرض، close إقفال / فتح، manage (المالك) التواريخ وبداية السنة
// ============================================================

const pad = (n) => String(n).padStart(2, "0");

// تاريخ المستند ← يوم (YYYY-MM-DD) بتوقيت الرياض
const dayFrom = (date) =>
  !date ? today() : typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : dayOf(date);

// آخر يوم في الشهر
const lastDay = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// حدود السنة المالية اللي بتبدأ في سنة code بشهر startMonth
export function fiscalRange(code, startMonth = 1) {
  const sm = Number(startMonth) || 1;
  const start = `${code}-${pad(sm)}-01`;
  const endYear = sm === 1 ? code : code + 1;
  const endMonth = sm === 1 ? 12 : sm - 1;
  const end = `${endYear}-${pad(endMonth)}-${pad(lastDay(endYear, endMonth))}`;
  return { start, end };
}

// رمز السنة المالية ليوم معيّن (من بداية السنة)
export function fiscalCodeOf(day, startMonth = 1) {
  const [y, m] = day.split("-").map(Number);
  return m >= (Number(startMonth) || 1) ? y : y - 1;
}

export async function fiscalStartMonth(db = prisma) {
  const s = await db.systemSettings.findUnique({ where: { id: 1 }, select: { fiscalStartMonth: true } });
  return s?.fiscalStartMonth ?? 1;
}

const toDto = (y) => ({
  id: y.id,
  code: y.code,
  startDate: dbDateToDay(y.startDate),
  endDate: dbDateToDay(y.endDate),
  status: y.status,
  closedAt: y.closedAt,
});

// السنة المالية ليوم: المتسجلة (بالتواريخ) أو بتتعمل (جوه نفس الـ transaction)
// closedCheck: مستند جديد ← ممنوع في سنة مقفلة
export async function ensureFiscalYear(tx, date, { closedCheck = true } = {}) {
  const day = dayFrom(date);
  const at = dayToDbDate(day);
  let fy = await tx.fiscalYear.findFirst({
    where: { startDate: { lte: at }, endDate: { gte: at } },
    select: { id: true, code: true, status: true },
  });
  if (!fy) {
    const sm = await fiscalStartMonth(tx);
    const code = fiscalCodeOf(day, sm);
    const { start, end } = fiscalRange(code, sm);
    try {
      fy = await tx.fiscalYear.create({
        data: { code, startDate: dayToDbDate(start), endDate: dayToDbDate(end) },
        select: { id: true, code: true, status: true },
      });
    } catch (error) {
      // اتعملت في نفس اللحظة من جهاز تاني
      if (error?.code !== "P2002") throw error;
      fy = await tx.fiscalYear.findUnique({ where: { code }, select: { id: true, code: true, status: true } });
    }
  }
  if (closedCheck && fy.status === "closed") throw new AppError("FiscalYearClosed", { year: fy.code });
  return fy;
}

// تعديل مستند محفوظ: رقمه من سنة مالية معيّنة (docCode = 2026DM)
// ← التاريخ الجديد لازم يفضل في نفس السنة، والسنة مش مقفلة
// (المستندات القديمة اللي من غير سنة في الرمز: فحص الإقفال بس)
export async function assertDocYear(tx, docCode, date) {
  const { year } = splitDocCode(docCode);
  const fy = await ensureFiscalYear(tx, date, { closedCheck: false });
  if (fy.status === "closed") throw new AppError("FiscalYearClosed", { year: fy.code });
  if (year && fy.code !== year) throw new AppError("FiscalYearChange", { year });
  if (year) {
    const own = await tx.fiscalYear.findUnique({ where: { code: year }, select: { status: true } });
    if (own?.status === "closed") throw new AppError("FiscalYearClosed", { year });
  }
}

// رمز السنة المالية لليوم الحالي (للعرض، من غير ما يعمل سنة)
export async function currentFiscalCode() {
  const at = dayToDbDate(today());
  const fy = await prisma.fiscalYear.findFirst({
    where: { startDate: { lte: at }, endDate: { gte: at } },
    select: { code: true },
  });
  return fy?.code ?? fiscalCodeOf(today(), await fiscalStartMonth());
}

// بداية السنة المالية الحالية (YYYY-MM-DD): الفترة الافتراضية في التقارير وكشوف الحساب
export async function currentFiscalStart() {
  const at = dayToDbDate(today());
  const fy = await prisma.fiscalYear.findFirst({
    where: { startDate: { lte: at }, endDate: { gte: at } },
    select: { startDate: true },
  });
  if (fy) return dbDateToDay(fy.startDate);
  const sm = await fiscalStartMonth();
  return fiscalRange(fiscalCodeOf(today(), sm), sm).start;
}

// السنوات المالية للاختيار (فلاتر التقارير): الأحدث الأول
export async function fiscalYearOptions() {
  const years = await prisma.fiscalYear.findMany({
    orderBy: { code: "desc" },
    select: { code: true, startDate: true, endDate: true },
  });
  return years.map((y) => ({ code: y.code, startDate: dbDateToDay(y.startDate), endDate: dbDateToDay(y.endDate) }));
}

// ------------------------------------------------------------
// شاشة السنوات المالية (الإدارة)
// ------------------------------------------------------------
export async function listFiscalYears() {
  // السنة الحالية بتتعمل لو مش موجودة (عشان تظهر في الشاشة من أول يوم)
  await prisma.$transaction((tx) => ensureFiscalYear(tx, today(), { closedCheck: false }));
  const [years, startMonth] = await Promise.all([
    prisma.fiscalYear.findMany({ orderBy: { code: "desc" } }),
    fiscalStartMonth(),
  ]);
  const current = await currentFiscalCode();
  return { years: years.map((y) => ({ ...toDto(y), current: y.code === current })), startMonth };
}

// إقفال / فتح سنة (fiscalYears.close)
export async function setFiscalYearStatus({ id, status }) {
  const y = await prisma.fiscalYear.findUnique({ where: { id }, select: { id: true } });
  if (!y) throw new AppError("NotFound");
  await prisma.fiscalYear.update({
    where: { id },
    data: { status, closedAt: status === "closed" ? new Date() : null },
  });
  return { id };
}

// تعديل تواريخ سنة (المالك - fiscalYears.manage): من غير تداخل مع سنة تانية
export async function updateFiscalYear({ id, startDate, endDate }) {
  if (endDate <= startDate) throw new AppError("FiscalYearDates", null, { endDate: "FiscalYearDates" });
  const y = await prisma.fiscalYear.findUnique({ where: { id }, select: { id: true } });
  if (!y) throw new AppError("NotFound");
  const overlap = await prisma.fiscalYear.findFirst({
    where: {
      id: { not: id },
      startDate: { lte: dayToDbDate(endDate) },
      endDate: { gte: dayToDbDate(startDate) },
    },
    select: { code: true },
  });
  if (overlap) throw new AppError("FiscalYearOverlap", { year: overlap.code });
  await prisma.fiscalYear.update({
    where: { id },
    data: { startDate: dayToDbDate(startDate), endDate: dayToDbDate(endDate) },
  });
  return { id };
}

// بداية السنة المالية (المالك - fiscalYears.manage): للسنين الجديدة بس
export async function setFiscalStartMonth(month) {
  await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, fiscalStartMonth: month },
    update: { fiscalStartMonth: month },
  });
  return { month };
}
