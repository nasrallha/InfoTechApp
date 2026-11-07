import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { bizToday } from "@/lib/business-day";
import { dayToDbDate } from "@/lib/dates";

// ============================================================
// طلبات المطعم ← الفاتورة (جوه transaction الفاتورة نفسها)
// - رقم الطلب يومي لكل فرع (RO-<الفرع>-<YYYYMMDD>) يبدأ من 1 كل يوم عمل
// - الطلب الجديد (سفري / توصيل / تطبيق) بيتعمل مدفوع مع الفاتورة
// - الطاولة المفتوحة (orderId) بتتقفل: مدفوع ومربوطة بالفاتورة
// ============================================================

const dayStartHour = async (db = prisma) =>
  (
    await db.systemSettings.findUnique({
      where: { id: 1 },
      select: { dayStartHour: true },
    })
  )?.dayStartHour ?? 0;

// الرقم اليومي الجاي (جوه transaction عشان مايتكررش)
export async function nextDailyNo(tx, branchId) {
  const day = bizToday(await dayStartHour(tx));
  const key = `RO-${branchId}-${day.replace(/-/g, "")}`;
  const seq = await tx.documentSequence.upsert({
    where: { key },
    create: { key, last: 1 },
    update: { last: { increment: 1 } },
    select: { last: true },
  });
  return { bizDay: dayToDbDate(day), dailyNo: seq.last };
}

// بيانات الطلب اللي بتتسجل (من غير السطور)
export const orderFields = (o) => ({
  orderType: o.orderType,
  tableNo: o.orderType === "dinein" ? (o.tableNo ?? null) : null,
  tableId: o.orderType === "dinein" ? (o.tableId ?? null) : null,
  partySize: o.orderType === "dinein" ? (o.partySize ?? null) : null,
  channelId: o.orderType === "app" ? (o.channelId ?? null) : null,
  channelOrderNo: o.orderType === "app" ? (o.channelOrderNo ?? null) : null,
  driverId: o.orderType === "delivery" ? (o.driverId ?? null) : null,
  customerId: o.customerId ?? null,
  customerName: o.customerName ?? null,
  phone: o.phone ?? null,
  address: o.orderType === "delivery" ? (o.address ?? null) : null,
  deliveryFee: o.orderType === "delivery" ? (o.deliveryFee ?? 0) : 0,
  serviceType: o.serviceType ?? "percent",
  servicePercent: o.servicePercent ?? 0,
});

export async function linkRestaurantSale(tx, order, saleId, user) {
  const data = {
    ...orderFields(order),
    status: "paid",
    orderLines: null,
    total: order.total ?? 0,
    saleId,
  };
  if (order.orderId) {
    // الطاولة لازم تكون لسه مفتوحة (ماتتفوترش مرتين)
    const { count } = await tx.restaurantOrder.updateMany({
      where: { id: order.orderId, status: "open", branchId: user.branch.id },
      data: { ...data, orderLines: undefined },
    });
    if (!count) throw new AppError("RestaurantOrderNotOpen");
    // السطور اتنقلت للفاتورة
    await tx.$executeRaw`UPDATE restaurant_orders SET orderLines = NULL WHERE id = ${order.orderId}`;
    return { orderId: order.orderId };
  }
  const no = await nextDailyNo(tx, user.branch.id);
  const created = await tx.restaurantOrder.create({
    data: {
      ...data,
      orderLines: undefined,
      branchId: user.branch.id,
      ...no,
      createdById: user.id,
    },
    select: { id: true },
  });
  return { orderId: created.id };
}
