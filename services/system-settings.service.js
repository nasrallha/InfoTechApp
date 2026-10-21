import "server-only";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SCALE } from "@/lib/scale-barcode";
import { writeAppLocale } from "@/lib/app-locale";

// الإعدادات العامة للنظام: صف واحد فقط (id = 1)
const SETTINGS_ID = 1;

export const DEFAULT_SYSTEM_SETTINGS = {
  taxRate: 15,
  productPriceIncludesTax: false,
  allowNegativeStock: false,
  purchaseTaxMode: "exclusive",
  // باركود الميزان
  ...DEFAULT_SCALE,
  // اللغة الافتراضية
  defaultLocale: "en",
  localeDetection: true,
};

const select = {
  taxRate: true,
  productPriceIncludesTax: true,
  allowNegativeStock: true,
  purchaseTaxMode: true,
  scaleEnabled: true,
  scaleFormat: true,
  scaleFlag: true,
  scaleValueType: true,
  scaleWeightDecimals: true,
  scaleMoneyDecimals: true,
  defaultLocale: true,
  localeDetection: true,
  updatedAt: true,
};

// إعدادات باركود الميزان بس (للبحث بالباركود في البيع)
export async function getScaleSettings() {
  const s = await prisma.systemSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: {
      scaleEnabled: true,
      scaleFormat: true,
      scaleFlag: true,
      scaleValueType: true,
      scaleWeightDecimals: true,
      scaleMoneyDecimals: true,
    },
  });
  return s ?? DEFAULT_SCALE;
}

// Decimal ← رقم
const toDTO = (s) => ({ ...s, taxRate: Number(s.taxRate) });

// المحفوظة، أو الافتراضية لو لم تُحفظ بعد
export async function getSystemSettings() {
  const saved = await prisma.systemSettings.findUnique({
    where: { id: SETTINGS_ID },
    select,
  });
  return saved ? toDTO(saved) : { ...DEFAULT_SYSTEM_SETTINGS, updatedAt: null };
}

export async function saveSystemSettings(data) {
  const saved = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
    select,
  });
  // الـ proxy بيقرا اللغة من ملف (lib/app-locale)
  writeAppLocale(saved);
  return toDTO(saved);
}

// وقت تشغيل البرنامج: ملف اللغة يتطابق مع قاعدة البيانات
export async function syncAppLocale() {
  const s = await prisma.systemSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { defaultLocale: true, localeDetection: true },
  });
  if (s) writeAppLocale(s);
}
