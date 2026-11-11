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
  serialRequired: true,
  allowDuplicateLines: false,
  staffTitle: "technician",
  // الحجوزات (وحدة bookings)
  bookingOnline: false,
  bookingOpen: "10:00",
  bookingClose: "22:00",
  bookingSlotMin: 30,
  bookingDaysAhead: 30,
  bookingHome: false,
  bookingNote: null,
  // بداية يوم العمل (0 = منتصف الليل)
  dayStartHour: 0,
  purchaseTaxMode: "exclusive",
  // باركود الميزان
  ...DEFAULT_SCALE,
  // اللغة الافتراضية
  defaultLocale: "en",
  localeDetection: true,
  // تتبع الصلاحية (ميزة expiry)
  expiryBlockSale: true,
  expiryAutoDispose: false,
  expiryAlertDays: 30,
  expiryBarcode: "simple",
};

const select = {
  taxRate: true,
  productPriceIncludesTax: true,
  allowNegativeStock: true,
  serialRequired: true,
  allowDuplicateLines: true,
  staffTitle: true,
  bookingOnline: true,
  bookingOpen: true,
  bookingClose: true,
  bookingSlotMin: true,
  bookingDaysAhead: true,
  bookingHome: true,
  bookingNote: true,
  dayStartHour: true,
  purchaseTaxMode: true,
  scaleEnabled: true,
  scaleFormat: true,
  scaleFlag: true,
  scaleValueType: true,
  scaleWeightDecimals: true,
  scaleMoneyDecimals: true,
  defaultLocale: true,
  localeDetection: true,
  expiryBlockSale: true,
  expiryAutoDispose: true,
  expiryAlertDays: true,
  expiryBarcode: true,
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
  // الـ proxy بيقرا اللغة من ملف (lib/app-locale)، لكل شركة ملفها
  writeAppLocale(saved, await localeCode());
  return toDTO(saved);
}

// كود الشركة الحالية (وضع الشركات) لملف اللغة
async function localeCode() {
  const { multiTenant, currentCompanyCode } = await import("@/lib/tenant");
  return multiTenant() ? await currentCompanyCode() : null;
}

// ملف اللغة يتطابق مع قاعدة البيانات
// - وقت تشغيل البرنامج (وضع الشركات: كل الشركات)
// - بعد الاسترجاع، وأول ما شركة تتفتح على السيرفر
export async function syncAppLocale() {
  const { multiTenant, currentCompanyCode, listCompanyCodes, runWithCompany } =
    await import("@/lib/tenant");
  const one = async (code) => {
    const s = await prisma.systemSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { defaultLocale: true, localeDetection: true },
    });
    if (s) writeAppLocale(s, code);
  };
  if (!multiTenant()) return one(null);
  const current = await currentCompanyCode();
  if (current) return one(current);
  // تشغيل السيرفر: كل الشركات
  for (const code of await listCompanyCodes()) {
    try {
      await runWithCompany(code, () => one(code));
    } catch (e) {
      console.error(`[locale] sync (${code}):`, e?.message ?? e);
    }
  }
}
