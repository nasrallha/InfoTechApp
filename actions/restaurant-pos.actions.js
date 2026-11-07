"use server";

// كاشير المطعم: الحساب (فاتورة + رقم الطلب) والطاولات المفتوحة
import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { idField } from "@/validations/common.schema";
import { createSaleSchema } from "@/validations/sale.schema";
import {
  restaurantCheckoutSchema,
  restaurantOrdersQuerySchema,
  saveOpenOrderSchema,
} from "@/validations/restaurant.schema";
import {
  buildRestaurantSale,
  cancelOpenOrder,
  listTodayOrders,
  saveOpenOrder,
} from "@/services/restaurant-pos.service";
import { orderFields } from "@/services/restaurant-link.service";
import { createSale } from "@/services/sale.service";
import { afterSaleSaved } from "@/services/zatca-invoice.service";

const pos = { permission: "sales.pos" };

// الحساب: السيرفر بيبني سطور الفاتورة وأسعارها والرسوم، والطلب بيتسجل مع الفاتورة
export const restaurantCheckoutAction = async (input) =>
  runAction(restaurantCheckoutSchema, input, async (d, user) => {
    const built = await buildRestaurantSale(d, user);
    const parsed = createSaleSchema.safeParse({
      source: "pos",
      customerId: d.customerId ?? null,
      discountType: d.discountType,
      discountValue: d.discountValue,
      notes: null,
      items: built.items,
      payments: d.payments,
      tenderedAmount: d.tenderedAmount,
      requestId: d.requestId ?? null,
    });
    if (!parsed.success)
      throw new AppError(parsed.error.issues[0]?.message ?? "ValidationError");
    const saved = await createSale(
      {
        ...parsed.data,
        restaurantPrices: built.restaurantPrices,
        // الرسوم (الخدمة / التوصيل / التبغ) بقيمتها الكاملة: مالهاش نصيب في خصم الفاتورة
        noDiscountProductIds: built.feeProductIds,
        restaurantOrder: {
          ...orderFields(d),
          orderId: d.orderId ?? null,
          total: 0,
        },
      },
      user,
    );
    // إجمالي الطلب = إجمالي الفاتورة
    const order = await prisma.restaurantOrder.findUnique({
      where: { saleId: saved.id },
      select: { id: true, dailyNo: true },
    });
    if (order)
      await prisma.restaurantOrder.update({
        where: { id: order.id },
        data: { total: Number(saved.totalAmount ?? 0) },
      });
    const zatca = await afterSaleSaved(saved.id, { background: true });
    return { ...saved, zatca, order };
  }, pos);

// الطاولة: حفظ / إضافة أصناف (من غير فاتورة)
export const saveOpenOrderAction = async (input) =>
  runAction(saveOpenOrderSchema, input, (d, user) => saveOpenOrder(d, user), pos);

// طلبات اليوم (المفتوحة الأول) + البحث برقم الطلب أو الطاولة
export const restaurantOrdersAction = async (input) =>
  runAction(
    restaurantOrdersQuerySchema,
    input,
    (d, user) => listTodayOrders(d, user),
    pos,
  );

// إلغاء طاولة مفتوحة (من غير فاتورة)
export const cancelOpenOrderAction = async (id) =>
  runAction(
    idField,
    id,
    (d, user) => {
      if (!can(user, "sales.pos")) throw new AppError("Forbidden");
      return cancelOpenOrder(d, user);
    },
    pos,
  );
