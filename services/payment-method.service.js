import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { multiTenant } from "@/lib/tenant";

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
  templateKey: true,
};

// طرق الدفع الثابتة (من لوحة التحكم) مقفولة في وضع الشركات بس
// (قاعدتك المرجعية بتعدّل فيها عادي)
const isLocked = (m) => Boolean(m?.templateKey) && multiTenant();

const orderBy = [{ sortOrder: "asc" }, { id: "asc" }];

// كل طرق الدفع (لشاشة الإعدادات)
export async function getPaymentMethods() {
  return prisma.paymentMethod.findMany({ orderBy, select });
}

// النشطة فقط (للفواتير لاحقاً)
// "رصيد الاشتراك" (type = sub، وحدة laundry) ما يظهرش في اختيار طرق الدفع:
// السيرفر بيضيفه لوحده في فاتورة المغسلة لما الرصيد يتخصم
export const SUBSCRIPTION_METHOD_TYPE = "sub";

export async function getActivePaymentMethods() {
  return prisma.paymentMethod.findMany({
    where: { isActive: true, type: { not: SUBSCRIPTION_METHOD_TYPE } },
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
    select: { id: true, templateKey: true },
  });
  if (!exists) throw new AppError("PaymentMethodNotFound");
  // الثابتة: التشغيل والإيقاف بس، والباقي من اللوحة
  if (isLocked(exists)) data = { isActive: data.isActive };
  if (data.isActive === false) await assertAnotherActive([id]);

  try {
    return await prisma.paymentMethod.update({ where: { id }, data, select });
  } catch (error) {
    handleUniqueError(error);
  }
}

// لازم تبقى طريقة دفع نشطة واحدة على الأقل
async function assertAnotherActive(ids) {
  const remaining = await prisma.paymentMethod.count({
    where: { id: { notIn: ids }, isActive: true },
  });
  if (remaining === 0) throw new AppError("LastPaymentMethod");
}

export async function deletePaymentMethods(ids) {
  await assertAnotherActive(ids);

  // الثابتة (من اللوحة) ما تتمسحش، تتوقف بس
  if (multiTenant()) {
    const fixed = await prisma.paymentMethod.count({
      where: { id: { in: ids }, templateKey: { not: null } },
    });
    if (fixed > 0) throw new AppError("TemplatePaymentMethodLocked");
  }

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
