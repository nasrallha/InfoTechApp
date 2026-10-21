import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// الحقول التي نرجعها للواجهة
const branchSelect = {
  id: true,
  arName: true,
  enName: true,
  address: true,
  isActive: true,
  phone: true,
  registrationNo: true,
  city: true,
  district: true,
  street: true,
  buildingNo: true,
  additionalNo: true,
  postalCode: true,
  warehouseId: true,
  priceListId: true,
  warehouse: { select: { id: true, arName: true, enName: true } },
  priceList: { select: { id: true, arName: true, enName: true } },
};

// ------------------------------------------------------------
// القراءة
// ------------------------------------------------------------

// كل الفروع (لجدول الفروع)
export async function getBranches() {
  return prisma.branch.findMany({
    orderBy: { id: "asc" },
    select: branchSelect,
  });
}

// الفروع النشطة فقط (لقوائم الاختيار في فورم المستخدم)
export async function getActiveBranches() {
  return prisma.branch.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: branchSelect,
  });
}

// ------------------------------------------------------------
// قواعد مساعدة
// ------------------------------------------------------------

// P2002 = مخالفة @unique (اسم الفرع مكرر)
function handleUniqueError(error) {
  if (error?.code === "P2002") throw new AppError("BranchNameExists");
  throw error;
}

// ------------------------------------------------------------
// الإضافة والتعديل
// ------------------------------------------------------------

export async function createBranch(data) {
  try {
    return await prisma.branch.create({ data, select: branchSelect });
  } catch (error) {
    handleUniqueError(error);
  }
}

export async function updateBranch({ id, ...data }) {
  const exists = await prisma.branch.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw new AppError("BranchNotFound");

  try {
    return await prisma.branch.update({
      where: { id },
      data,
      select: branchSelect,
    });
  } catch (error) {
    handleUniqueError(error);
  }
}

// ------------------------------------------------------------
// الحذف
// ------------------------------------------------------------

export async function deleteBranches(ids) {
  // لا نحذف فرعاً عليه مستخدمون
  const blocked = await prisma.branch.findMany({
    where: {
      id: { in: ids },
      OR: [
        { users: { some: {} } },
        { purchases: { some: {} } },
        { sales: { some: {} } },
        { quotations: { some: {} } },
        { shifts: { some: {} } },
      ],
    },
    select: { arName: true, enName: true },
  });

  if (blocked.length > 0) throw new AppError("BranchInUse", blocked);

  const { count } = await prisma.branch.deleteMany({
    where: { id: { in: ids } },
  });
  return { deleted: count };
}
