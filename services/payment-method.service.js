import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// ============================================================
// طرق الدفع
// ============================================================

const select = {
  id: true,
  arName: true,
  enName: true,
  type: true,
  requiresReference: true,
  sortOrder: true,
  isActive: true,
};

const orderBy = [{ sortOrder: "asc" }, { id: "asc" }];

// كل طرق الدفع (لشاشة الإعدادات)
export async function getPaymentMethods() {
  return prisma.paymentMethod.findMany({ orderBy, select });
}

// النشطة فقط (للفواتير لاحقاً)
export async function getActivePaymentMethods() {
  return prisma.paymentMethod.findMany({
    where: { isActive: true },
    orderBy,
    select,
  });
}

function handleUniqueError(error) {
  if (error?.code === "P2002") throw new AppError("PaymentMethodNameExists");
  throw error;
}

export async function createPaymentMethod(data) {
  try {
    return await prisma.paymentMethod.create({ data, select });
  } catch (error) {
    handleUniqueError(error);
  }
}

export async function updatePaymentMethod({ id, ...data }) {
  const exists = await prisma.paymentMethod.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw new AppError("PaymentMethodNotFound");

  try {
    return await prisma.paymentMethod.update({ where: { id }, data, select });
  } catch (error) {
    handleUniqueError(error);
  }
}

export async function deletePaymentMethods(ids) {
  // لازم تبقى طريقة دفع نشطة واحدة على الأقل
  const remaining = await prisma.paymentMethod.count({
    where: { id: { notIn: ids }, isActive: true },
  });
  if (remaining === 0) throw new AppError("LastPaymentMethod");

  // طريقة دفع مستخدمة في فواتير لا تُحذف (يمكن إيقافها بدلاً من ذلك)
  const used = await prisma.paymentMethod.count({
    where: {
      id: { in: ids },
      OR: [{ purchasePayments: { some: {} } }, { salePayments: { some: {} } }],
    },
  });
  if (used > 0) throw new AppError("PaymentMethodInUse");

  const { count } = await prisma.paymentMethod.deleteMany({
    where: { id: { in: ids } },
  });
  return { deleted: count };
}
