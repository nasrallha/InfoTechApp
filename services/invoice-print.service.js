import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { saveImage, deleteImage } from "@/lib/upload";
import { cookies } from "next/headers";
import { DEVICE_PAPER_COOKIE, isDevicePaper } from "@/lib/device-paper";
import { ensureDeviceKey, getDeviceKey } from "@/lib/device-key";

// إعدادات طباعة الفواتير: صف واحد فقط (id = 1)
const SETTINGS_ID = 1;

// القيم الافتراضية (لو لم تُحفظ الإعدادات بعد)
export const DEFAULT_INVOICE_PRINT = {
  paperSize: "80mm",
  marginTop: 2,
  marginBottom: 2,
  marginRight: 2,
  marginLeft: 2,
  fontSize: "normal",
  language: "both",
  showLogo: true,
  logoSize: "medium",
  showCashier: true,
  showCustomer: true,
  showPhone: true,
  showEmail: false,
  showItemCode: false,
  showUnit: true,
  showDiscount: true,
  showItemTax: false,
  showBankAccount: false,
  footerTextAr: null,
  footerTextEn: null,
  autoPrint: false,
  copies: 1,
  // نموذج A4 + الورق الجاهز
  a4Template: "classic",
  showSignatures: true,
  letterTop: 45,
  letterBottom: 0,
  letterImage: null,
};

const select = Object.fromEntries(
  Object.keys(DEFAULT_INVOICE_PRINT).map((k) => [k, true]),
);

// الإعدادات المحفوظة، أو الافتراضية لو لم تُحفظ بعد
// نستخدمها لاحقاً عند طباعة فواتير المبيعات
// إعدادات الجهاز: كل الحقول ما عدا صورة الورق الجاهز (واحدة للشركة)
const DEVICE_KEYS = Object.keys(DEFAULT_INVOICE_PRINT).filter((k) => k !== "letterImage");
const pickDevice = (obj) =>
  Object.fromEntries(DEVICE_KEYS.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

async function companySettings() {
  const saved = await prisma.invoicePrintSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { ...select, updatedAt: true },
  });
  return saved ?? { ...DEFAULT_INVOICE_PRINT, updatedAt: null };
}

// إعدادات الجهاز ده المحفوظة (null = مالوش إعدادات خاصة)
async function deviceRow() {
  const key = await getDeviceKey();
  if (!key) return null;
  return prisma.devicePrintSettings
    .findUnique({ where: { deviceKey: key } })
    .catch(() => null); // القاعدة لسه متحدّثتش (الجدول مش موجود)
}

// الإعدادات اللي بتتطبع بيها: إعدادات الجهاز ده (لو ليه) فوق إعدادات الشركة
// device = false ← إعدادات الشركة زي ما هي (شاشة الإعدادات: «الافتراضية لكل الأجهزة»)
export async function getInvoicePrintSettings({ device = true } = {}) {
  const settings = await companySettings();
  if (!device) return settings;
  const row = await deviceRow();
  if (row?.invoice) return { ...settings, ...pickDevice(row.invoice) };
  // مقاس الورق القديم على الجهاز (كوكي) - قبل إعدادات الجهاز الكاملة
  const paper = await legacyDevicePaper();
  return paper ? { ...settings, paperSize: paper } : settings;
}

async function legacyDevicePaper() {
  try {
    const v = (await cookies()).get(DEVICE_PAPER_COOKIE)?.value;
    return isDevicePaper(v) ? v : null;
  } catch {
    return null;
  }
}

// شاشة الإعدادات: إعدادات الجهاز ده (null = مالوش، بيستخدم الافتراضية)
export async function getDeviceInvoiceSettings() {
  const row = await deviceRow();
  if (!row?.invoice) return null;
  return { ...(await companySettings()), ...pickDevice(row.invoice), updatedAt: row.updatedAt };
}

// حفظ إعدادات الجهاز ده (بيعمل رقم للجهاز لو مالوش)
export async function saveDeviceInvoiceSettings(data) {
  const deviceKey = await ensureDeviceKey();
  const invoice = pickDevice(data);
  await prisma.devicePrintSettings.upsert({
    where: { deviceKey },
    create: { deviceKey, invoice },
    update: { invoice },
  });
  return { ...(await companySettings()), ...invoice };
}

// الجهاز ده يرجع للإعدادات الافتراضية
export async function resetDeviceInvoiceSettings() {
  const deviceKey = await getDeviceKey();
  if (deviceKey)
    await prisma.devicePrintSettings.updateMany({
      where: { deviceKey },
      data: { invoice: Prisma.DbNull },
    });
  return { reset: true };
}

// ---------- قالب ملصق الباركود للجهاز ده ----------
export async function getDeviceBarcodeLabelId() {
  return (await deviceRow())?.barcodeLabelId ?? null;
}

export async function setDeviceBarcodeLabel(labelId) {
  const deviceKey = await ensureDeviceKey();
  await prisma.devicePrintSettings.upsert({
    where: { deviceKey },
    create: { deviceKey, barcodeLabelId: labelId },
    update: { barcodeLabelId: labelId },
  });
  return { labelId };
}

// حفظ الإعدادات: أول مرة تُنشأ، وبعدها تُعدّل
export async function saveInvoicePrintSettings(data) {
  return prisma.invoicePrintSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
    select: { ...select, updatedAt: true },
  });
}

// صورة الورقة المطبوعة الجاهزة (نموذج A4 «ورق جاهز»): خلفية في المعاينة والـ PDF
// image: ملف جديد، أو null = حذف الصورة
export async function saveLetterImage(image) {
  const current = await prisma.invoicePrintSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { letterImage: true },
  });
  const path = image ? await saveImage(image, "print") : null;
  await prisma.invoicePrintSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...DEFAULT_INVOICE_PRINT, letterImage: path },
    update: { letterImage: path },
  });
  if (current?.letterImage) await deleteImage(current.letterImage);
  return { letterImage: path };
}
