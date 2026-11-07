import "server-only";
import { prisma } from "@/lib/prisma";
import { round } from "@/lib/invoice-calc";
import { can } from "@/lib/permissions";
import { previewSaleTotals } from "./sale.service";
import {
  buildLines,
  getOrdersToInvoice,
  invoiceLines,
} from "./laundry-order.service";
import { planWalletUse, splitWalletValue } from "./laundry-wallet.service";

// ============================================================
// المغسلة: الدفع من الاشتراك في فاتورة الكاشير
// G = إجمالي الفاتورة (بالعروض والخصم اليدوي) قبل المكافأة
// - الرصيد بيتخصم بقيمة الخدمات (credit = لحد G)
// - المكافأة (bonus) بتنزل خصم في الفاتورة ← الإجمالي = G - bonus
// - المدفوع من الرصيد = الإجمالي - الباقي كاش (G - credit)
// كل الأرقام من نفس حساب الفاتورة (previewSaleTotals) عشان تطابق الحفظ بالظبط
// ============================================================
export async function walletCheckout(base, customerId, user) {
  const p0 = await previewSaleTotals(base, user);
  const G = p0.total;
  const plan = await planWalletUse(customerId, G);
  if (!(plan.credit > 0)) return null;

  let discount = {
    discountType: base.discountType,
    discountValue: base.discountValue,
  };
  let total = G;
  if (plan.bonus > 0) {
    // خصم الفاتورة (مبلغ) = الخصم اليدوي + اللي يخلي الإجمالي ينزل بالمكافأة
    // (السعر غير الشامل: الخصم قبل الضريبة، فبنحسبه بالتناسب)
    const m = p0.invoiceDiscount;
    const totalAt = async (x) =>
      (
        await previewSaleTotals(
          { ...base, discountType: "amount", discountValue: x },
          user,
        )
      ).total;
    const t1 = await totalAt(round(m + plan.bonus, 2));
    const slope = (G - t1) / plan.bonus || 1;
    let x = round(m + plan.bonus / slope, 2);
    total = await totalAt(x);
    // تصحيح فرق التقريب (قرش)
    const diff = round(G - plan.bonus - total, 2);
    if (Math.abs(diff) >= 0.01) {
      x = round(x - diff / slope, 2);
      total = await totalAt(x);
    }
    discount = { discountType: "amount", discountValue: x };
  }
  const cashDue = round(Math.max(0, G - plan.credit), 2);
  const walletPay = round(Math.max(0, total - cashDue), 2);
  return {
    gross: G,
    total,
    cashDue,
    walletPay,
    credit: plan.credit,
    bonus: round(plan.credit - walletPay, 2),
    balance: plan.balance,
    discount,
    uses: splitWalletValue(plan.uses, walletPay).filter((u) => u.credit > 0),
  };
}

// معاينة قبل الدفع (لسه الطلب الجديد ما اتحفظش): سطور الفاتورة والعميل
export async function previewInvoiceData({ orderIds, newOrder }, user) {
  const orders = orderIds.length ? await getOrdersToInvoice(orderIds, user) : [];
  const fresh = newOrder
    ? await buildLines(newOrder.items, {
        allowPrice: can(user, "sales.changePrice"),
      })
    : [];
  const items = await invoiceLines([...orders, { items: fresh }]);
  let customerId = orders[0]?.customerId ?? newOrder?.customerId ?? null;
  if (!customerId && newOrder?.phone) {
    const c = await prisma.customer.findUnique({
      where: { phone: newOrder.phone },
      select: { id: true },
    });
    customerId = c?.id ?? null;
  }
  return {
    customerId,
    items,
    laundryPrices: items.map((i) => ({ productId: i.productId, price: i.price })),
  };
}
