// ============================================================
// إعدادات أمان الدخول: الاختيارات المتاحة + القيم الافتراضية
// (مشترك بين السيرفر والواجهة، مفيهوش أي حاجة سرية)
// المدد بالدقايق إلا sessionHours بالساعات و logRetentionDays بالأيام
// ============================================================

const H = 60; // دقايق الساعة
const D = 24 * H; // دقايق اليوم

export const SECURITY_OPTIONS = {
  // 0 = بدون قفل
  maxAttempts: [0, 3, 4, 5, 6, 7, 8, 10, 15, 20],
  attemptWindowMinutes: [5, 10, 15, 30, H, 2 * H, 6 * H, D],
  lockMinutes: [1, 2, 3, 5, 10, 15, 20, 30, H, 2 * H, 3 * H, 6 * H, 12 * H, D],
  // 0 = بدون قفل على الجهاز
  ipMaxAttempts: [0, 10, 15, 20, 30, 50, 100],
  // 0 = بدون خروج تلقائي
  idleMinutes: [
    0,
    5,
    10,
    15,
    20,
    30,
    45,
    H,
    90,
    2 * H,
    3 * H,
    4 * H,
    6 * H,
    8 * H,
    12 * H,
    D,
  ],
  // بالساعات: من ساعة لسنة
  sessionHours: [
    1, 2, 3, 4, 6, 8, 10, 12, 16, 24, 48, 72, 168, 336, 720, 1440, 2160, 4320,
    8760,
  ],
  // 0 = بدون حد
  maxDevices: [0, 1, 2, 3, 4, 5, 10, 20],
  logRetentionDays: [7, 14, 30, 60, 90, 180, 365, 730],
};

export const DEVICE_LIMIT_MODES = ["oldest", "reject"];

export const DEFAULT_SECURITY = {
  maxAttempts: 5,
  attemptWindowMinutes: 15,
  lockMinutes: 10,
  progressiveLock: true,
  showRemaining: true,
  ipMaxAttempts: 0,
  idleMinutes: 0,
  sessionHours: 168,
  logoutOnBrowserClose: false,
  maxDevices: 0,
  deviceLimitMode: "oldest",
  deviceLimitSkipSuper: true,
  logRetentionDays: 90,
};

// القفل المتزايد: مدة القفل × المعامل حسب عدد مرات القفل (10 ← 30 ← 60 ← ...)
const PROGRESSIVE = [1, 3, 6, 12, 24, 48];
const MAX_LOCK_MINUTES = 30 * D;

export function lockDuration(settings, lockCount) {
  const base = settings.lockMinutes;
  if (!settings.progressiveLock) return base;
  const f = PROGRESSIVE[Math.min(lockCount, PROGRESSIVE.length - 1)];
  return Math.min(base * f, MAX_LOCK_MINUTES);
}

// المدة (بالدقايق) ← { unit, n } للعرض: سنة / شهر / أسبوع / يوم / ساعة / دقيقة
export function splitDuration(minutes) {
  const m = Number(minutes) || 0;
  const units = [
    ["years", 365 * D],
    ["months", 30 * D],
    ["weeks", 7 * D],
    ["days", D],
    ["hours", H],
  ];
  for (const [unit, size] of units) {
    if (m >= size && m % size === 0) return { unit, n: m / size };
  }
  return { unit: "minutes", n: m };
}

// ------------------------------------------------------------
// اسم الجهاز من الـ User-Agent (من غير مكتبة): المتصفح + النظام + النوع
// ------------------------------------------------------------
export function parseUserAgent(ua) {
  const s = String(ua ?? "");
  if (!s) return { browser: null, os: null, mobile: false };
  const pick = (list) => {
    for (const [name, re] of list) {
      const m = s.match(re);
      if (m)
        return m[1] ? `${name} ${m[1].replace(/_/g, ".").split(".")[0]}` : name;
    }
    return null;
  };
  const browser = pick([
    ["Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ["Opera", /(?:OPR|Opera)\/([\d.]+)/],
    ["Samsung Internet", /SamsungBrowser\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ]);
  const os = pick([
    ["Windows", /Windows NT/],
    ["Android", /Android ([\d.]+)/],
    ["iOS", /(?:iPhone|iPad|iPod).*OS ([\d_]+)/],
    ["macOS", /Mac OS X/],
    ["ChromeOS", /CrOS/],
    ["Linux", /Linux/],
  ]);
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(s);
  return { browser, os, mobile };
}
