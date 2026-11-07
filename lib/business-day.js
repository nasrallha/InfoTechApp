// ============================================================
// يوم العمل (الإعدادات العامة ← بداية يوم العمل)
//
// h = ساعة بداية يوم العمل بتوقيت السعودية (0 = منتصف الليل = اليوم العادي)
// مثال h = 5: يوم 30 بيبدأ 30 الساعة 5:00 الصبح ويخلص 31 الساعة 4:59:59
//   ← فاتورة الساعة 1 الفجر يوم 31 تتحسب على يوم 30
//
// بيتطبق على: الورديات (ترتيب الوردية في اليوم)، تقارير المبيعات والمشتريات
// والأرباح واليومية والعمولات، والصفحة الرئيسية
// مش بيتطبق على: الضريبة والفوترة الإلكترونية (بالتاريخ الحقيقي للفاتورة)،
// ومواعيد الحجوزات والمتابعات (مواعيد بالساعة)
//
// الدوال هنا من غير قاعدة بيانات (شغالة في السيرفر والمتصفح)، والساعة بتتبعت لها
// ============================================================
import { dayOf } from "./dates";

const HOUR = 3_600_000;
export const MAX_DAY_START_HOUR = 12;

// الساعة صح (0 - 12)
export const cleanHour = (h) => {
  const v = Math.trunc(Number(h) || 0);
  return v < 0 || v > MAX_DAY_START_HOUR ? 0 : v;
};

const pad = (x) => String(x).padStart(2, "0");

// اليوم اللي بعده (YYYY-MM-DD)
export const nextDay = (day) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

// بداية يوم العمل (لحظة)
export const bizDayStart = (day, h = 0) =>
  new Date(`${day}T${pad(cleanHour(h))}:00:00+03:00`);

// نهاية يوم العمل: قبل بداية اليوم اللي بعده بجزء من الثانية
export const bizDayEnd = (day, h = 0) =>
  new Date(bizDayStart(nextDay(day), h).getTime() - 1);

// يوم العمل للحظة معيّنة
export const bizDayOf = (date = new Date(), h = 0) =>
  dayOf(new Date(new Date(date).getTime() - cleanHour(h) * HOUR));

// يوم العمل الحالي
export const bizToday = (h = 0) => bizDayOf(new Date(), h);

// شهر يوم العمل (YYYY-MM)
export const bizMonthOf = (date, h = 0) => bizDayOf(date, h).slice(0, 7);

// الوقت (HH:mm) صح؟
export const isTime = (v) =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// لحظة في يوم العمل: اليوم + الساعة (HH:mm)
// الساعة قبل بداية يوم العمل ← تبع نفس يوم العمل بس تاريخها اليوم اللي بعده
// (h = 5: يوم 30 الساعة 01:00 = 31 الساعة 1 الفجر)
export const bizDateTime = (day, time, h = 0) => {
  const hour = Number(time.slice(0, 2));
  const date = hour < cleanHour(h) ? nextDay(day) : day;
  return new Date(`${date}T${time}:00+03:00`);
};

// فلتر Prisma لفترة (من / إلى) بأيام العمل
// fromTime / toTime (اختياري، HH:mm): من يوم الساعة كذا لـ يوم الساعة كذا
// (الدقيقة الأخيرة داخلة: لحد 13:30 = لحد 13:30:59)
export const bizRange = ({ from, to, fromTime, toTime }, h = 0) => ({
  ...(from
    ? {
        gte: isTime(fromTime)
          ? bizDateTime(from, fromTime, h)
          : bizDayStart(from, h),
      }
    : {}),
  ...(to
    ? {
        lte: isTime(toTime)
          ? new Date(bizDateTime(to, toTime, h).getTime() + 59_999)
          : bizDayEnd(to, h),
      }
    : {}),
});

// نص الساعة للعرض (05:00)
export const hourText = (h) => `${pad(cleanHour(h))}:00`;
