import "server-only";
import { prisma } from "@/lib/prisma";
import { saveImage, deleteImage } from "@/lib/upload";

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
export async function getInvoicePrintSettings() {
  const saved = await prisma.invoicePrintSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { ...select, updatedAt: true },
  });
  return saved ?? { ...DEFAULT_INVOICE_PRINT, updatedAt: null };
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
