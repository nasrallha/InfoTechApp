import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// ============================================================
// المستودعات
// - مستودع رئيسي واحد فقط (عليه الرصيد الافتتاحي للأصناف)
// - لا يُحذف مستودع عليه حركات أو مربوط بفرع (يمكن إيقافه)
// ============================================================

const select = {
  id: true,
  arName: true,
  enName: true,
  isMain: true,
  isActive: true,
  notes: true,
  branches: { select: { id: true, arName: true, enName: true } },
};

export async function getWarehouses() {
  return prisma.warehouse.findMany({
    orderBy: [{ isMain: "desc" }, { id: "asc" }],
    select,
  });
}

export async function getActiveWarehouses() {
  return prisma.warehouse.findMany({
    where: { isActive: true },
    orderBy: [{ isMain: "desc" }, { id: "asc" }],
    select: { id: true, arName: true, enName: true, isMain: true },
  });
}

// مستودع فرع معيّن (أو الرئيسي لو الفرع بدون مستودع)
export async function getBranchWarehouseId(branchId) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { warehouseId: true },
  });
  if (branch?.warehouseId) return branch.warehouseId;
  const main = await prisma.warehouse.findFirst({
    where: { isMain: true },
    select: { id: true },
  });
  return main?.id ?? null;
}

function handleUniqueError(error) {
  if (error?.code === "P2002") throw new AppError("WarehouseNameExists");
  throw error;
}

// الرئيسي واحد فقط: لو اتعلّم مستودع كرئيسي يتشال من الباقي
async function saveWarehouse(id, data) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (data.isMain) {
        await tx.warehouse.updateMany({
          where: { isMain: true, ...(id ? { id: { not: id } } : {}) },
          data: { isMain: false },
        });
        data.isActive = true;
      }
      return id
        ? tx.warehouse.update({ where: { id }, data, select })
        : tx.warehouse.create({ data, select });
    });
  } catch (error) {
    handleUniqueError(error);
  }
}

export async function createWarehouse(data) {
  return saveWarehouse(null, data);
}

export async function updateWarehouse({ id, ...data }) {
  const current = await prisma.warehouse.findUnique({
    where: { id },
    select: { isMain: true },
  });
  if (!current) throw new AppError("WarehouseNotFound");
  // لازم يفضل فيه مستودع رئيسي: الرئيسي لا يُلغى إلا باختيار غيره
  if (current.isMain && !data.isMain) {
    throw new AppError("MainWarehouseRequired");
  }
  return saveWarehouse(id, data);
}

export async function deleteWarehouses(ids) {
  const used = await prisma.warehouse.findMany({
    where: {
      id: { in: ids },
      OR: [
        { isMain: true },
        { branches: { some: {} } },
        { movements: { some: {} } },
        { purchases: { some: {} } },
        { sales: { some: {} } },
        { transfersOut: { some: {} } },
        { transfersIn: { some: {} } },
        { counts: { some: {} } },
      ],
    },
    select: { arName: true, enName: true },
  });
  if (used.length) throw new AppError("WarehouseInUse", used);

  await prisma.stockBalance.deleteMany({ where: { warehouseId: { in: ids } } });
  const { count } = await prisma.warehouse.deleteMany({
    where: { id: { in: ids } },
  });
  return { deleted: count };
}
