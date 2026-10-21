// ============================================================
// اللغة الافتراضية للبرنامج (من الإعدادات العامة)
// الـ proxy (اللي بيختار اللغة قبل أي صفحة) مايقدرش يسأل قاعدة البيانات مع كل طلب،
// فالإعداد بيتنسخ لملف صغير على السيرفر وقت الحفظ (ووقت تشغيل البرنامج)
// والـ proxy بيقراه (وبيعيد قراءته لو اتغيّر)
// ============================================================
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), ".runtime", "app-locale.json");
const LOCALES = ["ar", "en"];
export const DEFAULT_APP_LOCALE = {
  defaultLocale: "en",
  // دايماً مقفول: البرنامج بيفتح باللغة اللي في الإعدادات (مش لغة المتصفح ولا آخر اختيار)
  localeDetection: false,
};

const clean = (v) => ({
  defaultLocale: LOCALES.includes(v?.defaultLocale)
    ? v.defaultLocale
    : DEFAULT_APP_LOCALE.defaultLocale,
  localeDetection: false,
});

const g = globalThis;

// قراءة سريعة (بنبص على الملف كل 3 ثواني بالكتير)
export function readAppLocale() {
  const c = g.__erpAppLocale;
  const now = Date.now();
  if (c && now - c.checkedAt < 3000) return c.value;
  let value = DEFAULT_APP_LOCALE;
  let mtime = 0;
  try {
    mtime = fs.statSync(FILE).mtimeMs;
    value =
      c && c.mtime === mtime
        ? c.value
        : clean(JSON.parse(fs.readFileSync(FILE, "utf8")));
  } catch {
    value = DEFAULT_APP_LOCALE; // الملف لسه متعملش
  }
  g.__erpAppLocale = { value, mtime, checkedAt: now };
  return value;
}

export function writeAppLocale(settings) {
  const value = clean(settings);
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(value), "utf8");
    g.__erpAppLocale = null;
  } catch (e) {
    console.error("[locale] cannot write:", e?.message ?? e);
  }
  return value;
}
