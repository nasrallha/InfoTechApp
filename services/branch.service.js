import "server-only";
import { assertPlanLimit } from "@/lib/plan-limits";
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
  idScheme: true,
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

// مستودع باسم الفرع: «مستودع الخبر» / «Al Khobar Warehouse»
// (لو الاسم موجود: رقم في الآخر)
// («فرع الخبر» ← «مستودع الخبر»، «Khobar Branch» ← «Khobar Warehouse»)
const bareAr = (n) => n.trim().replace(/^فرع\s+/, "");
const bareEn = (n) =>
  n.trim().replace(/^branch\s+/i, "").replace(/\s+branch$/i, "");
async function createBranchWarehouse(tx, branch) {
  const arName = bareAr(branch.arName) || branch.arName;
  const enName = bareEn(branch.enName) || branch.enName;
  for (let i = 1; i <= 50; i++) {
    const suffix = i === 1 ? "" : ` ${i}`;
    const ar = `مستودع ${arName}${suffix}`.slice(0, 100);
    const en = `${enName} Warehouse${suffix}`.slice(0, 100);
    const taken = await tx.warehouse.findFirst({
      where: { OR: [{ arName: ar }, { enName: en }] },
      select: { id: true },
    });
    if (taken) continue;
    const w = await tx.warehouse.create({
      data: { arName: ar, enName: en, isMain: false, isActive: true },
      select: { id: true },
    });
    return w.id;
  }
  throw new AppError("WarehouseNameTaken");
}

// الفرع + (اختياري) مستودع جديد باسمه في نفس العملية
async function withNewWarehouse(tx, { newWarehouse, ...data }) {
  if (!newWarehouse) return data;
  return { ...data, warehouseId: await createBranchWarehouse(tx, data) };
}

export async function createBranch(input, user) {
  // حد الفروع في الباقة
  await assertPlanLimit("branches", user);
  try {
    return await prisma.$transaction(async (tx) =>
      tx.branch.create({
        data: await withNewWarehouse(tx, input),
        select: branchSelect,
      }),
    );
  } catch (error) {
    handleUniqueError(error);
  }
}

export async function updateBranch({ id, ...input }) {
  const exists = await prisma.branch.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw new AppError("BranchNotFound");

  try {
    // فرع موجود على الرئيسي: «مستودع جديد باسم الفرع» بيتعمل ويتربط
    return await prisma.$transaction(async (tx) =>
      tx.branch.update({
        where: { id },
        data: await withNewWarehouse(tx, input),
        select: branchSelect,
      }),
    );
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
