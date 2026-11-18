// ============================================================
// إعدادات الورديات (المالك) - من غير قاعدة بيانات (السيرفر والمتصفح)
// - multiDrawer: أكتر من درج في وردية الفرع (كل كاشير بدرجه)
//   false ← درج واحد للفرع: الباقيين ينضموا له (بصلاحية الانضمام)
// - autoClose: وردية الفرع بتتقفل لوحدها مع آخر درج
//   false ← المدير / المشرف بيقفلها يدوي (بعد قفل كل الأدراج)
// - periods: أوقات الورديات [{ arName, enName, start: "08:00", end: "16:00" }]
//   وردية الفرع بتاخد اسم الفترة اللي فيها وقت الفتح (اختياري)
// ============================================================

export const DEFAULT_SHIFT_SETTINGS = { multiDrawer: true, autoClose: true, periods: [] };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (v) => typeof v === "string" && TIME_RE.test(v);

// القيمة المحفوظة (JSON) ← إعدادات سليمة
export function normalizeShiftSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const periods = Array.isArray(s.periods)
    ? s.periods
        .filter((p) => p && isTime(p.start) && isTime(p.end) && String(p.arName ?? "").trim())
        .map((p) => ({
          arName: String(p.arName).trim().slice(0, 50),
          enName: String(p.enName ?? "").trim().slice(0, 50),
          start: p.start,
          end: p.end,
        }))
    : [];
  return {
    multiDrawer: s.multiDrawer !== false,
    autoClose: s.autoClose !== false,
    periods,
  };
}

// الدقايق من أول اليوم (08:30 ← 510)
const minutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// الساعة دلوقتي بتوقيت السعودية (HH:mm)
export const riyadhTime = (date = new Date()) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

// الفترة اللي فيها الوقت ده (الفترة اللي بتعدّي نص الليل: 22:00 ← 06:00 مدعومة)
export function periodAt(periods, time = riyadhTime()) {
  const now = minutes(time);
  return (
    (periods ?? []).find((p) => {
      const a = minutes(p.start);
      const b = minutes(p.end);
      return a <= b ? now >= a && now < b : now >= a || now < b;
    }) ?? null
  );
}
