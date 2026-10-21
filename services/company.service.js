import "server-only";
import { prisma } from "@/lib/prisma";
import { saveImage, deleteImage } from "@/lib/upload";

// بيانات الشركة: صف واحد فقط في قاعدة البيانات (id = 1)
const COMPANY_ID = 1;
const IMAGES_FOLDER = "company";

const companySelect = {
  arName: true,
  enName: true,
  taxNo: true,
  registrationNo: true,
  sellerIdScheme: true,
  sellerIdNumber: true,
  phone: true,
  email: true,
  bankName: true,
  bankAccountName: true,
  bankAccountNumber: true,
  iban: true,
  city: true,
  district: true,
  street: true,
  buildingNo: true,
  additionalNo: true,
  postalCode: true,
  logo: true,
  updatedAt: true,
};

// بيانات الشركة (أو null لو لم تُدخل بعد)
// نستخدمها لاحقاً في الفواتير والتقارير
export async function getCompany() {
  return prisma.company.findUnique({
    where: { id: COMPANY_ID },
    select: companySelect,
  });
}

// حفظ بيانات الشركة: أول مرة تُنشأ، وبعدها تُعدّل (upsert)
export async function saveCompany({ logo, removeLogo, ...data }) {
  const current = await prisma.company.findUnique({
    where: { id: COMPANY_ID },
    select: { logo: true },
  });

  // الشعار: جديد / حذف الحالي / كما هو (undefined = لا تغيير)
  let newLogo;
  if (logo) newLogo = await saveImage(logo, IMAGES_FOLDER);
  else if (removeLogo) newLogo = null;
  const logoChanged = newLogo !== undefined;

  const values = logoChanged ? { ...data, logo: newLogo } : data;

  let saved;
  try {
    saved = await prisma.company.upsert({
      where: { id: COMPANY_ID },
      create: { id: COMPANY_ID, ...values },
      update: values,
      select: companySelect,
    });
  } catch (error) {
    // فشل الحفظ: نحذف الشعار الجديد الذي رفعناه
    if (newLogo) await deleteImage(newLogo);
    throw error;
  }

  // الحفظ نجح: نحذف الشعار القديم من الملفات
  if (logoChanged && current?.logo) await deleteImage(current.logo);

  return saved;
}
