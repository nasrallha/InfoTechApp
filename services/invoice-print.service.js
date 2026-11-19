import "server-only";
import { prisma } from "@/lib/prisma";
import { saveImage, deleteImage } from "@/lib/upload";
import { cookies } from "next/headers";
import { DEVICE_PAPER_COOKIE, isDevicePaper } from "@/lib/device-paper";

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
// device: مقاس الورق المحفوظ على الجهاز ده (كوكي) بيغلب مقاس الشركة
// (شاشة إعدادات الطباعة نفسها: device = false ← إعداد الشركة زي ما هو)
export async function getInvoicePrintSettings({ device = true } = {}) {
  const saved = await prisma.invoicePrintSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { ...select, updatedAt: true },
  });
  const settings = saved ?? { ...DEFAULT_INVOICE_PRINT, updatedAt: null };
  if (!device) return settings;
  const paper = await devicePaper();
  return paper ? { ...settings, paperSize: paper } : settings;
}

async function devicePaper() {
  try {
    const v = (await cookies()).get(DEVICE_PAPER_COOKIE)?.value;
    return isDevicePaper(v) ? v : null;
  } catch {
    // برّه طلب (مفيش كوكيز)
    return null;
  }
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
