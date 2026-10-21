// ============================================================
// التواريخ: كل الأيام تُحسب بتوقيت السعودية
// (نفس النتيجة في السيرفر والمتصفح مهما كان توقيت الجهاز)
// اليوم يُكتب كنص "YYYY-MM-DD" حتى تكون المقارنة بسيطة وصحيحة
// ============================================================

export const TIME_ZONE = "Asia/Riyadh";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// اليوم (YYYY-MM-DD) لتاريخ معيّن، والافتراضي: الآن
export const dayOf = (date = new Date()) => dayFormat.format(new Date(date));

// اليوم الحالي
export const today = () => dayOf(new Date());

// نص "YYYY-MM-DD" صحيح؟
export const isDay = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

// يوم ← DateTime لعمود @db.Date (منتصف الليل UTC حتى لا يتغير اليوم)
export const dayToDbDate = (day) => new Date(`${day}T00:00:00Z`);

// عمود @db.Date ← يوم
export const dbDateToDay = (date) =>
  date ? new Date(date).toISOString().slice(0, 10) : null;

// تاريخ التسجيل: لو اليوم = النهارده نأخذ الوقت الحالي، وإلا منتصف ذلك اليوم
export const dayToDateTime = (day) =>
  !day || day === today() ? new Date() : new Date(`${day}T12:00:00+03:00`);

// عرض التاريخ والوقت (25/10/2026 14:30)
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
export const formatDateTime = (date) =>
  date ? dateTimeFormat.format(new Date(date)) : "";

// عرض التاريخ فقط (25/10/2026)
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const formatDate = (date) =>
  date ? dateFormat.format(new Date(date)) : "";

// يوم "YYYY-MM-DD" ← "DD/MM/YYYY"
export const formatDay = (day) =>
  day ? day.split("-").reverse().join("/") : "";

// بداية ونهاية اليوم بتوقيت السعودية (للفلترة من / إلى)
export const dayStart = (day) => new Date(`${day}T00:00:00+03:00`);
export const dayEnd = (day) => new Date(`${day}T23:59:59.999+03:00`);
