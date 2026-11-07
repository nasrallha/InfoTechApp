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
const CODE_RE = /^[A-Z2-9]{8}$/;

// وضع الشركات: ملف لكل شركة (.runtime/locale/<الكود>.json)
const fileFor = (code) =>
  code && CODE_RE.test(code)
    ? path.join(process.cwd(), ".runtime", "locale", `${code}.json`)
    : FILE;

function readFile(file) {
  g.__erpAppLocale ??= new Map();
  const c = g.__erpAppLocale.get(file);
  const now = Date.now();
  if (c && now - c.checkedAt < 3000) return c.value;
  let value = null;
  let mtime = 0;
  try {
    mtime = fs.statSync(file).mtimeMs;
    value =
      c && c.mtime === mtime
        ? c.value
        : clean(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    value = null; // الملف لسه متعملش
  }
  g.__erpAppLocale.set(file, { value, mtime, checkedAt: now });
  return value;
}

// قراءة سريعة (بنبص على الملف كل 3 ثواني بالكتير)
// code: كود الشركة (وضع الشركات)، ولو ملفها لسه متعملش: الإعداد العام
export function readAppLocale(code = null) {
  return (
    (code ? readFile(fileFor(code)) : null) ??
    readFile(FILE) ??
    DEFAULT_APP_LOCALE
  );
}

export function hasCompanyLocale(code) {
  return Boolean(code && fs.existsSync(fileFor(code)));
}

export function writeAppLocale(settings, code = null) {
  const value = clean(settings);
  const file = fileFor(code);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value), "utf8");
    g.__erpAppLocale?.delete(file);
  } catch (e) {
    console.error("[locale] cannot write:", e?.message ?? e);
  }
  return value;
}
