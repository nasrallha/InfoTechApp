import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// ============================================================
// قوالب ملصقات الباركود
// قاعدة: يوجد دائماً قالب افتراضي واحد فقط، ويكون نشطاً
// ============================================================

const labelSelect = {
  id: true,
  arName: true,
  enName: true,
  width: true,
  height: true,
  barcodeFormat: true,
  barcodeSize: true,
  showName: true,
  showPrice: true,
  priceWithTax: true,
  showCode: true,
  showCompany: true,
  nameFontSize: true,
  priceFontSize: true,
  isDefault: true,
  isActive: true,
};

// ------------------------------------------------------------
// القراءة
// ------------------------------------------------------------

// كل القوالب: الافتراضي أولاً ثم الأصغر مساحة
export async function getBarcodeLabels() {
  const labels = await prisma.barcodeLabel.findMany({ select: labelSelect });
  return labels.sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.width * a.height - b.width * b.height,
  );
}

// القوالب النشطة فقط (لشاشة طباعة الباركود لاحقاً)
export async function getActiveBarcodeLabels() {
  return (await getBarcodeLabels()).filter((l) => l.isActive);
}

// ------------------------------------------------------------
// قواعد مساعدة
// ------------------------------------------------------------

function handleUniqueError(error) {
  if (error?.code === "P2002") throw new AppError("LabelNameExists");
  throw error;
}

// القالب الافتراضي لازم يكون نشطاً
function assertDefaultIsActive(data) {
  if (data.isDefault && !data.isActive) {
    throw new AppError("DefaultLabelMustBeActive", null, { isActive: "DefaultLabelMustBeActive" });
  }
}

// لو لا يوجد قالب افتراضي (مثلاً بعد حذفه): أول قالب نشط يصبح الافتراضي
async function ensureDefault(tx) {
  const hasDefault = await tx.barcodeLabel.count({ where: { isDefault: true, isActive: true } });
  if (hasDefault) return;

  const first = await tx.barcodeLabel.findFirst({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (first) {
    await tx.barcodeLabel.updateMany({ data: { isDefault: false } });
    await tx.barcodeLabel.update({ where: { id: first.id }, data: { isDefault: true } });
  }
}

// ------------------------------------------------------------
// الإضافة والتعديل
// ------------------------------------------------------------

export async function createBarcodeLabel(data) {
  assertDefaultIsActive(data);

  try {
    return await prisma.$transaction(async (tx) => {
      // القالب الجديد افتراضي ← نلغي الافتراضي القديم
      if (data.isDefault) await tx.barcodeLabel.updateMany({ data: { isDefault: false } });

      const label = await tx.barcodeLabel.create({ data, select: labelSelect });
      await ensureDefault(tx);
      return label;
    });
  } catch (error) {
    handleUniqueError(error);
  }
}

export async function updateBarcodeLabel({ id, ...data }) {
  const current = await prisma.barcodeLabel.findUnique({
    where: { id },
    select: { isDefault: true },
  });
  if (!current) throw new AppError("LabelNotFound");

  // لا نلغي "افتراضي" من هنا: الافتراضي يتغير باختيار قالب آخر كافتراضي
  if (current.isDefault) data.isDefault = true;
  assertDefaultIsActive(data);

  try {
    return await prisma.$transaction(async (tx) => {
      if (data.isDefault && !current.isDefault) {
        await tx.barcodeLabel.updateMany({ data: { isDefault: false } });
      }
      return tx.barcodeLabel.update({ where: { id }, data, select: labelSelect });
    });
  } catch (error) {
    handleUniqueError(error);
  }
}

// جعل قالب هو الافتراضي (ويصبح نشطاً)
export async function setDefaultBarcodeLabel(id) {
  const exists = await prisma.barcodeLabel.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError("LabelNotFound");

  await prisma.$transaction([
    prisma.barcodeLabel.updateMany({ data: { isDefault: false } }),
    prisma.barcodeLabel.update({ where: { id }, data: { isDefault: true, isActive: true } }),
  ]);
}

// ------------------------------------------------------------
// الحذف
// ------------------------------------------------------------

export async function deleteBarcodeLabels(ids) {
  // لازم يبقى قالب واحد على الأقل
  const remaining = await prisma.barcodeLabel.count({ where: { id: { notIn: ids } } });
  if (remaining === 0) throw new AppError("LastLabel");

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.barcodeLabel.deleteMany({ where: { id: { in: ids } } });
    // لو حذفنا الافتراضي: أول قالب نشط يصبح الافتراضي
    await ensureDefault(tx);
    return { deleted: count };
  });
}
