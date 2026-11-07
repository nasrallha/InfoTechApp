import "server-only";
import { AppError } from "@/lib/errors";

// ============================================================
// المغسلة: ربط الطلبات بالفاتورة (جوه transaction الفاتورة)
// ملف لوحده عشان sale.service و laundry-order.service ما يستوردوش بعض
// - الطلب لازم يكون من غير فاتورة ومش ملغي (لو اتفوتر في نفس اللحظة: خطأ)
// - الطلب اللي اتفوتر = اتسلم (مفيش تغيير حالة يدوي)
// - walletUses: الصرف من الاشتراكات [{ walletId, credit, value, bonus }]
//   الرصيد بيتخصم بس لو لسه كفاية (لو اتصرف من جهاز تاني في نفس اللحظة: خطأ)
// ============================================================
export async function linkLaundrySale(tx, orderIds, saleId, user, walletUses = []) {
  for (const u of walletUses) {
    const { count } = await tx.laundryWallet.updateMany({
      where: { id: u.walletId, status: "active", remaining: { gte: u.credit } },
      data: { remaining: { decrement: u.credit } },
    });
    if (!count) throw new AppError("LaundryWalletChanged");
    await tx.laundryWalletUse.create({
      data: {
        walletId: u.walletId,
        saleId,
        credit: u.credit,
        value: u.value,
        bonus: u.bonus,
      },
    });
  }
  if (walletUses.length) {
    // الرصيد خلص ← الاشتراك "مستخدم بالكامل"
    await tx.laundryWallet.updateMany({
      where: {
        id: { in: walletUses.map((u) => u.walletId) },
        remaining: { lte: 0.0001 },
      },
      data: { status: "used" },
    });
  }
  const ids = [...new Set(orderIds)];
  const { count } = await tx.laundryOrder.updateMany({
    where: {
      id: { in: ids },
      branchId: user.branch.id,
      saleId: null,
      status: { not: "cancelled" },
    },
    data: { saleId },
  });
  if (count !== ids.length) throw new AppError("LaundryOrderInvoiced");
  // أي طلب اتفوتر (كاش / شبكة / اشتراك) = اتسلم، من غير تغيير حالة يدوي
  await tx.laundryOrder.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "delivered",
      deliveredAt: new Date(),
      deliveredById: user.id,
    },
  });
}

// ============================================================
// مرتجع فاتورة اتدفعت من الاشتراك (جوه transaction المرتجع)
// - نصيب الاشتراك من المرتجع = المرتجع × (المدفوع من الرصيد ÷ إجمالي الفاتورة)
//   ومش أكتر من اللي لسه ما رجعش (مرتجعات قبل كده لنفس الفاتورة)
// - الرصيد بيرجع بقيمة الخدمات (credit)، يعني بالمكافأة زي ما اتخصم
// - الصرف المرتجع بيتسجل بقيم سالبة على فاتورة المرتجع
// ============================================================
const n = (v) => (v == null ? 0 : Number(v));
const r = (v, d = 2) => Math.round((Number(v) + Number.EPSILON) * 10 ** d) / 10 ** d;

export async function laundryReturnPlan(tx, originalId, returnTotal, decimals = 2) {
  const sale = await tx.sale.findUnique({
    where: { id: originalId },
    select: {
      totalAmount: true,
      laundryWalletUses: {
        select: { walletId: true, credit: true, value: true },
      },
    },
  });
  const orig = sale?.laundryWalletUses ?? [];
  if (!orig.length || !(n(sale.totalAmount) > 0)) return { value: 0, uses: [] };
  const origValue = orig.reduce((s, u) => s + n(u.value), 0);
  const origCredit = orig.reduce((s, u) => s + n(u.credit), 0);
  if (!(origValue > 0)) return { value: 0, uses: [] };
  // اللي رجع للرصيد قبل كده من مرتجعات الفاتورة دي (قيم سالبة)
  const prev = await tx.laundryWalletUse.findMany({
    where: { sale: { returnOfId: originalId } },
    select: { value: true },
  });
  const refundable = r(
    origValue - prev.reduce((s, u) => s + Math.abs(n(u.value)), 0),
    decimals,
  );
  const value = r(
    Math.min(refundable, (returnTotal * origValue) / n(sale.totalAmount)),
    decimals,
  );
  if (!(value > 0)) return { value: 0, uses: [] };
  // على الاشتراكات بنسبة صرف كل واحد
  const byWallet = new Map();
  for (const u of orig)
    byWallet.set(u.walletId, (byWallet.get(u.walletId) ?? 0) + n(u.value));
  const list = [...byWallet.entries()];
  let leftValue = value;
  const uses = list.map(([walletId, wv], i) => {
    const v =
      i === list.length - 1 ? r(leftValue, decimals) : r((value * wv) / origValue, decimals);
    leftValue = r(leftValue - v, decimals);
    const credit = r((v * origCredit) / origValue, decimals);
    return { walletId, value: v, credit, bonus: r(credit - v, decimals) };
  });
  return { value, uses };
}

// تنفيذ المرتجع على الاشتراكات: الرصيد يزيد، والمستخدم بالكامل يرجع نشط
export async function applyLaundryReturn(tx, returnSaleId, uses) {
  for (const u of uses) {
    const { count } = await tx.laundryWallet.updateMany({
      where: { id: u.walletId, status: { in: ["active", "used"] } },
      data: { remaining: { increment: u.credit }, status: "active" },
    });
    // الاشتراك انتهى / اتلغى: الرصيد يزيد بس (حالته زي ما هي)
    if (!count)
      await tx.laundryWallet.update({
        where: { id: u.walletId },
        data: { remaining: { increment: u.credit } },
      });
    await tx.laundryWalletUse.create({
      data: {
        walletId: u.walletId,
        saleId: returnSaleId,
        credit: -u.credit,
        value: -u.value,
        bonus: -u.bonus,
      },
    });
  }
}
