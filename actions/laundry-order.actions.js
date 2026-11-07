"use server";

// طلبات المغسلة (وحدة laundry): الاستلام ولوحة الطلبات
import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { idField } from "@/validations/common.schema";
import {
  cancelLaundryOrderSchema,
  deliverLaundryOrdersSchema,
  findLaundryOrdersSchema,
  laundryCheckoutSchema,
  laundryCustomerLookupSchema,
  laundryReturnSchema,
  laundryOrderListSchema,
  laundrySummarySchema,
  laundryWalletSettingsSchema,
  createLaundryWalletSchema,
  saveLaundryOrderSchema,
  setLaundryOrderStatusSchema,
} from "@/validations/laundry.schema";
import { createSaleSchema } from "@/validations/sale.schema";
import {
  cancelLaundryOrder,
  createLaundryOrder,
  deliverLaundryOrders,
  dropUninvoicedOrder,
  findOrdersToInvoice,
  getLaundryOrder,
  laundryDaySummary,
  laundryInvoiceData,
  listLaundryOrders,
  lookupLaundryCustomer,
  setLaundryOrderStatus,
  updateLaundryOrder,
} from "@/services/laundry-order.service";
import { createSale, createSaleReturn } from "@/services/sale.service";
import { afterSaleSaved } from "@/services/zatca-invoice.service";
import {
  previewInvoiceData,
  walletCheckout,
} from "@/services/laundry-checkout.service";
import {
  cancelWallet,
  createWallet,
  customerWallets,
  getWalletSettings,
  saveWalletSettings,
  subscriptionMethodId,
} from "@/services/laundry-wallet.service";

// شاشة الاستلام: صاحب الإضافة أو التعديل بيدوّر على العميل
const canReceive = (user) =>
  can(user, "laundryOrders.create") || can(user, "laundryOrders.update");

export const lookupLaundryCustomerAction = async (phone) =>
  runAction(laundryCustomerLookupSchema, phone, (d, user) => {
    if (!canReceive(user)) throw new AppError("Forbidden");
    return lookupLaundryCustomer(d, user);
  });

// إضافة (من غير id) أو تعديل (بالـ id)
export const saveLaundryOrderAction = async (input) =>
  runAction(saveLaundryOrderSchema, input, (d, user) => {
    const perm = d.id ? "laundryOrders.update" : "laundryOrders.create";
    if (!can(user, perm)) throw new AppError("Forbidden");
    return d.id ? updateLaundryOrder(d, user) : createLaundryOrder(d, user);
  });

export const getLaundryOrderAction = async (id) =>
  runAction(idField, id, (d, user) => getLaundryOrder(d, user), {
    permission: "laundryOrders.view",
  });

export const listLaundryOrdersAction = async (input) =>
  runAction(
    laundryOrderListSchema,
    input,
    (d, user) => listLaundryOrders(d, user),
    { permission: "laundryOrders.view" },
  );

export const laundryDaySummaryAction = async (day) =>
  runAction(laundrySummarySchema, day, (d, user) => laundryDaySummary(d, user), {
    permission: "laundryOrders.view",
  });

export const setLaundryOrderStatusAction = async (input) =>
  runAction(
    setLaundryOrderStatusSchema,
    input,
    (d, user) => setLaundryOrderStatus(d, user),
    { permission: "laundryOrders.update" },
  );

export const cancelLaundryOrderAction = async (input) =>
  runAction(
    cancelLaundryOrderSchema,
    input,
    (d, user) => cancelLaundryOrder(d, user),
    { permission: "laundryOrders.cancel" },
  );

// ------------------------------------------------------------
// الكاشير (وضع المغسلة)
// ------------------------------------------------------------

// تحميل طلبات في السلة عشان تتفوتر
export const findLaundryOrdersAction = async (input) =>
  runAction(findLaundryOrdersSchema, input, (d, user) => {
    if (!can(user, "sales.pos")) throw new AppError("Forbidden");
    return findOrdersToInvoice(d, user);
  });

// بيانات فاتورة الكاشير بنفس قواعدها (القيم الافتراضية والتحقق)
function saleBase(d, inv, payments) {
  const parsed = createSaleSchema.safeParse({
    source: "pos",
    customerId: inv.customerId,
    discountType: d.discountType,
    discountValue: d.discountValue,
    notes: inv.notes ?? null,
    items: inv.items,
    payments,
    tenderedAmount: d.tenderedAmount,
    requestId: d.requestId ?? null,
  });
  if (!parsed.success)
    throw new AppError(parsed.error.issues[0]?.message ?? "ValidationError");
  return { ...parsed.data, laundryPrices: inv.laundryPrices };
}

// قبل الدفع: كام يتخصم من الاشتراك وكام الباقي (من غير حفظ)
// null = العميل مالوش رصيد
export const laundryWalletPreviewAction = async (input) =>
  runAction(laundryCheckoutSchema, input, async (d, user) => {
    if (!can(user, "sales.pos")) throw new AppError("Forbidden");
    const inv = await previewInvoiceData(d, user);
    if (!inv.customerId || !inv.items.length) return null;
    const plan = await walletCheckout(saleBase(d, inv, []), inv.customerId, user);
    if (!plan) return null;
    // الملخص بس (من غير تفاصيل الصرف)
    return {
      gross: plan.gross,
      total: plan.total,
      cashDue: plan.cashDue,
      walletPay: plan.walletPay,
      credit: plan.credit,
      bonus: plan.bonus,
      balance: plan.balance,
    };
  });

// الدفع: القطع الجديدة ← طلب، والطلبات كلها ← فاتورة بيع واحدة (الكاشير)
// - السطور والأسعار والعميل من الطلبات (السيرفر)، والشاشة بتبعت الدفع بس
// - useWallet: الرصيد بيتخصم (FIFO) والمكافأة خصم، والشاشة بتبعت الباقي بس
// - الفاتورة فشلت ← الطلب الجديد بيتمسح (العملية كلها يا تتم يا لأ)
export const laundryCheckoutAction = async (input) =>
  runAction(laundryCheckoutSchema, input, async (d, user) => {
    if (!can(user, "sales.pos")) throw new AppError("Forbidden");
    if (d.newOrder && !can(user, "laundryOrders.create"))
      throw new AppError("Forbidden");
    const created = d.newOrder
      ? await createLaundryOrder(d.newOrder, user)
      : null;
    const orderIds = [...d.orderIds, ...(created ? [created.id] : [])];
    try {
      const inv = await laundryInvoiceData(orderIds, user);
      const base = saleBase(d, inv, d.payments);
      const plan = d.useWallet
        ? await walletCheckout(base, inv.customerId, user)
        : null;
      const walletPayment =
        plan?.walletPay > 0
          ? [
              {
                paymentMethodId: await subscriptionMethodId(),
                amount: plan.walletPay,
                reference: null,
              },
            ]
          : [];
      const saved = await createSale(
        {
          ...base,
          ...(plan ? plan.discount : {}),
          payments: [...base.payments, ...walletPayment],
          laundryOrderIds: orderIds,
          laundryWalletUses: plan?.uses ?? [],
        },
        user,
      );
      // الفاتورة الإلكترونية في الخلفية (زي الكاشير)
      const zatca = await afterSaleSaved(saved.id, { background: true });
      return {
        ...saved,
        zatca,
        orders: inv.orders.map((o) => ({ id: o.id, dailyNo: o.dailyNo })),
        wallet: plan
          ? { paid: plan.walletPay, credit: plan.credit, bonus: plan.bonus }
          : null,
      };
    } catch (e) {
      if (created) await dropUninvoicedOrder(created.id);
      throw e;
    }
  });

// التسليم: الطلبات المفوترة (المدفوعة) ← مسلَّم
export const deliverLaundryOrdersAction = async (input) =>
  runAction(
    deliverLaundryOrdersSchema,
    input,
    (d, user) => deliverLaundryOrders(d.ids, user),
    { permission: "laundryOrders.update" },
  );

// ------------------------------------------------------------
// الاشتراكات (من الكاشير)
// ------------------------------------------------------------

// اشتراكات العميل ورصيده وصرفه
export const customerWalletsAction = async (customerId) =>
  runAction(idField, customerId, (d) => customerWallets(d), {
    permission: "laundrySubscriptions.view",
  });

// اشتراك جديد (سند قبض + رصيد)
export const createLaundryWalletAction = async (input) =>
  runAction(createLaundryWalletSchema, input, (d, user) => createWallet(d, user), {
    permission: "laundrySubscriptions.create",
  });

// إلغاء اشتراك ما اتصرفش منه
export const cancelLaundryWalletAction = async (id) =>
  runAction(idField, id, (d, user) => cancelWallet(d, user), {
    permission: "laundrySubscriptions.cancel",
  });

// إعدادات الاشتراك (المدة + المكافأة خصم)
export const laundryWalletSettingsAction = async () =>
  runAction(null, null, () => getWalletSettings(), {
    permission: "laundry.view",
  });

export const saveLaundryWalletSettingsAction = async (input) =>
  runAction(laundryWalletSettingsSchema, input, (d) => saveWalletSettings(d), {
    permission: "laundry.manage",
    refresh: true,
  });

// ------------------------------------------------------------
// المرتجع من شاشة الاستلام
// - نصيب الاشتراك من المرتجع بيرجع للرصيد (بالمكافأة)، والباقي بطريقة الاسترداد
// - نفس مرتجع المبيعات (المخزون، الضريبة، الزكاة)
// ------------------------------------------------------------
export const laundryReturnAction = async (input) =>
  runAction(
    laundryReturnSchema,
    input,
    async (d, user) => {
      const created = await createSaleReturn(
        {
          saleId: d.saleId,
          items: d.items.map((i) => ({ ...i, serialIds: [] })),
          payments: [],
          notes: d.notes ?? null,
          requestId: d.requestId ?? null,
          laundryRefund: {
            methodId: d.refundMethodId,
            subMethodId: await subscriptionMethodId(),
          },
        },
        user,
      );
      const zatca = await afterSaleSaved(created.id, { background: true });
      return { ...created, zatca };
    },
    { permission: "salesReturns.create" },
  );
