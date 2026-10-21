import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// الحقول التي نرجعها للواجهة
const unitSelect = {
  id: true,
  arName: true,
  enName: true,
  isActive: true,
};

// ------------------------------------------------------------
// القراءة
// ------------------------------------------------------------

// كل الوحدات (لجدول الوحدات)
export async function getUnits() {
  return prisma.unit.findMany({
    orderBy: { id: "asc" },
    select: unitSelect,
  });
}

// الوحدات النشطة فقط (لقوائم الاختيار في فورم المنتج)
export async function getActiveUnits() {
  return prisma.unit.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: unitSelect,
  });
}

// ------------------------------------------------------------
// قواعد مساعدة
// ------------------------------------------------------------

// P2002 = مخالفة @unique (اسم الوحدة مكرر)
function handleUniqueError(error) {
  if (error?.code === "P2002") throw new AppError("UnitNameExists");
  throw error;
}

// ------------------------------------------------------------
// الإضافة والتعديل
// ------------------------------------------------------------

export async function createUnit(data) {
  try {
    return await prisma.unit.create({ data, select: unitSelect });
  } catch (error) {
    handleUniqueError(error);
  }
}

export async function updateUnit({ id, ...data }) {
  const exists = await prisma.unit.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError("UnitNotFound");

  try {
    return await prisma.unit.update({ where: { id }, data, select: unitSelect });
  } catch (error) {
    handleUniqueError(error);
  }
}

// ------------------------------------------------------------
// الحذف
// ------------------------------------------------------------

export async function deleteUnits(ids) {
  // لا نحذف وحدة مستخدمة: وحدة أساسية لمنتج، أو وحدة إضافية لمنتج
  const blocked = await prisma.unit.findMany({
    where: {
      id: { in: ids },
      OR: [
        { products: { some: {} } },
        { productUnits: { some: {} } },
        { purchaseItems: { some: {} } }, // مستخدمة في فواتير مشتريات
      ],
    },
    select: { arName: true, enName: true },
  });

  if (blocked.length > 0) throw new AppError("UnitInUse", blocked);

  const { count } = await prisma.unit.deleteMany({ where: { id: { in: ids } } });
  return { deleted: count };
}
