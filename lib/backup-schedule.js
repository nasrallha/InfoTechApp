// ============================================================
// مواعيد النسخ الاحتياطي التلقائي (مشترك بين الشاشة والسيرفر)
// المواعيد بتوقيت السعودية (UTC+3 ثابت، مفيش توقيت صيفي)
// - hours:  كل X ساعة من آخر نسخة
// - daily:  كل يوم الساعة HH:mm
// - weekly: كل أسبوع يوم معيّن الساعة HH:mm
// لو الجهاز كان مقفول وقت الميعاد: أول ما البرنامج يشتغل بيعمل النسخة اللي فاتت
// ============================================================

export const BACKUP_FREQUENCIES = ["hours", "daily", "weekly"];
export const BACKUP_EVERY_HOURS = [1, 2, 3, 4, 6, 8, 12];
export const BACKUP_KEEP = [0, 3, 5, 7, 10, 14, 21, 30, 60, 90];
// كل نص ساعة: 00:00 ... 23:30
export const BACKUP_TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  return `${h}:${i % 2 ? "30" : "00"}`;
});

const OFFSET = 3 * 60 * 60 * 1000; // السعودية
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// الساعة HH:mm في يوم معيّن بتوقيت السعودية ← Date
function slotOn(date, time) {
  const d = new Date(date.getTime() + OFFSET);
  const [hh, mm] = String(time || "03:00")
    .split(":")
    .map(Number);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm) -
      OFFSET,
  );
}
const weekdayOf = (date) => new Date(date.getTime() + OFFSET).getUTCDay();

// آخر ميعاد كان المفروض يتعمل فيه نسخة (<= دلوقتي) - يومي / أسبوعي
function lastSlot(s, now) {
  let t = slotOn(now, s.backupTime);
  if (s.backupFrequency === "weekly") {
    const back = (weekdayOf(now) - Number(s.backupWeekday) + 7) % 7;
    t = new Date(t.getTime() - back * DAY);
    if (t > now) t = new Date(t.getTime() - 7 * DAY);
    return t;
  }
  if (t > now) t = new Date(t.getTime() - DAY);
  return t;
}

// آخر نسخة تلقائية، أو وقت تشغيل النسخ التلقائي (عشان ميعملش نسخ لمواعيد قبل التشغيل)
function baseOf(s) {
  const times = [s.lastAutoBackupAt, s.backupAutoSince]
    .filter(Boolean)
    .map((d) => new Date(d).getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

// جه وقت نسخة؟
export function isBackupDue(s, now = new Date()) {
  if (!s?.backupAutoEnabled) return false;
  const base = baseOf(s);
  if (s.backupFrequency === "hours") {
    return !base || now - base >= Number(s.backupEveryHours) * HOUR;
  }
  return !base || lastSlot(s, now) > base;
}

// النسخة الجاية إمتى (للعرض)
export function nextBackupAt(s, now = new Date()) {
  if (!s?.backupAutoEnabled) return null;
  if (isBackupDue(s, now)) return now;
  if (s.backupFrequency === "hours") {
    return new Date(baseOf(s).getTime() + Number(s.backupEveryHours) * HOUR);
  }
  const step = s.backupFrequency === "weekly" ? 7 * DAY : DAY;
  return new Date(lastSlot(s, now).getTime() + step);
}

// ملفات النسخ التلقائي بتبدأ بـ auto_ (عشان العرض والمسح التلقائي للقديم)
export const AUTO_PREFIX = "auto_";
export const isAutoBackup = (name) => String(name).startsWith(AUTO_PREFIX);

// نسخة الأمان اللي بتتعمل قبل الاسترجاع، والملفات المرفوعة من جهاز المستخدم
export const SAFETY_PREFIX = "before_restore_";
export const UPLOAD_PREFIX = "uploaded_";
export function backupKind(name) {
  const n = String(name);
  if (n.startsWith(AUTO_PREFIX)) return "auto";
  if (n.startsWith(SAFETY_PREFIX)) return "safety";
  if (n.startsWith(UPLOAD_PREFIX)) return "uploaded";
  return "manual";
}
