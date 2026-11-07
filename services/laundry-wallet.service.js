import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule } from "@/lib/modules";
import { runTx } from "@/lib/transaction";
import { round } from "@/lib/invoice-calc";
import { dayToDbDate, dbDateToDay, today } from "@/lib/dates";
import { createVoucher, deleteVoucher } from "./voucher.service";
import { SUBSCRIPTION_METHOD_TYPE } from "./payment-method.service";
import { resolveCustomer } from "./laundry-order.service";

// ============================================================
// المغسلة (وحدة laundry) - الاشتراكات (رصيد العميل)
// - العميل يدفع paidAmount (100) ويتشحن له creditAmount (130)
// - الفلوس بسند قبض "إيراد متنوع" (بيدخل الدرج زي أي سند)، والرصيد هنا
// - الصرف في فواتير الكاشير بالأقدم (FIFO) وكل صرف متسجل بفاتورته
// - مكافأة الاشتراك (الـ 30 من 130) بتنزل خصم في الفاتورة (إعداد):
//   العميل بيشوف رصيده بيتخصم بقيمة الخدمات، والضريبة على اللي دفعه فعلاً
// - مدة الاشتراك (إعداد): 0 = لحد ما الرصيد يخلص، غير كده بيخلص بعد كام شهر
//   (الرصيد في كل الفروع)
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const SEQ_KEY = "LW";
const METHOD_KEY = "LAUNDRY_SUB";

// اليوم بعد كام شهر (31 يناير + شهر = 28/29 فبراير)
function addMonths(day, months) {
  const d = new Date(`${day}T12:00:00Z`);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0),
  ).getUTCDate();
  t.setUTCDate(Math.min(d.getUTCDate(), last));
  return t.toISOString().slice(0, 10);
}

// ------------------------------------------------------------
// الإعدادات
// ------------------------------------------------------------
export async function getWalletSettings() {
  const s = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { laundryWalletMonths: true, laundryBonusDiscount: true },
  });
  return {
    months: s?.laundryWalletMonths ?? 0,
    bonusDiscount: s?.laundryBonusDiscount ?? true,
  };
}

export async function saveWalletSettings({ months, bonusDiscount }) {
  await assertModule("laundry");
  const data = { laundryWalletMonths: months, laundryBonusDiscount: bonusDiscount };
  await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });
  return getWalletSettings();
}

// ------------------------------------------------------------
// طريقة الدفع "رصيد الاشتراك": بتتعمل أول مرة (مخفية من اختيار طرق الدفع)
// ------------------------------------------------------------
export async function subscriptionMethodId() {
  const found = await prisma.paymentMethod.findFirst({
    where: { templateKey: METHOD_KEY },
    select: { id: true, isActive: true },
  });
  if (found) {
    if (!found.isActive)
      await prisma.paymentMethod.update({
        where: { id: found.id },
        data: { isActive: true },
      });
    return found.id;
  }
  try {
    const m = await prisma.paymentMethod.create({
      data: {
        arName: "رصيد الاشتراك",
        enName: "Subscription balance",
        type: SUBSCRIPTION_METHOD_TYPE,
        templateKey: METHOD_KEY,
        sortOrder: 999,
      },
      select: { id: true },
    });
    return m.id;
  } catch (e) {
    // اتعملت في نفس اللحظة
    const again = await prisma.paymentMethod.findFirst({
      where: { templateKey: METHOD_KEY },
      select: { id: true },
    });
    if (again) return again.id;
    throw e;
  }
}

// ------------------------------------------------------------
// الاشتراكات الشغالة (فيها رصيد ولسه ما خلصتش) بالأقدم
// ------------------------------------------------------------
const activeWhere = (customerId) => ({
  customerId,
  status: "active",
  remaining: { gt: 0 },
  OR: [{ expiresAt: null }, { expiresAt: { gte: dayToDbDate(today()) } }],
});

export async function walletBalance(customerId) {
  const rows = await prisma.laundryWallet.findMany({
    where: activeWhere(customerId),
    select: { remaining: true },
  });
  return round(rows.reduce((s, r) => s + n(r.remaining), 0), 4);
}

// خطة الصرف لمبلغ (قيمة الخدمات): كام من كل اشتراك + خصم المكافأة
// credit = من الرصيد، bonus = نصيب المكافأة منه (لو الإعداد شغال)
export async function planWalletUse(customerId, amount) {
  const [wallets, { bonusDiscount }] = await Promise.all([
    prisma.laundryWallet.findMany({
      where: activeWhere(customerId),
      orderBy: { id: "asc" },
      select: {
        id: true,
        paidAmount: true,
        creditAmount: true,
        remaining: true,
      },
    }),
    getWalletSettings(),
  ]);
  const uses = [];
  let rest = round(amount, 2);
  for (const w of wallets) {
    if (rest <= 0) break;
    const credit = round(Math.min(n(w.remaining), rest), 2);
    if (credit <= 0) continue;
    const share =
      bonusDiscount && n(w.creditAmount) > 0
        ? Math.max(0, (n(w.creditAmount) - n(w.paidAmount)) / n(w.creditAmount))
        : 0;
    uses.push({ walletId: w.id, credit, bonus: round(credit * share, 2) });
    rest = round(rest - credit, 2);
  }
  return {
    balance: round(
      wallets.reduce((s, w) => s + n(w.remaining), 0),
      2,
    ),
    credit: round(uses.reduce((s, u) => s + u.credit, 0), 2),
    bonus: round(uses.reduce((s, u) => s + u.bonus, 0), 2),
    uses,
  };
}

// توزيع المدفوع من الرصيد (value) على الاشتراكات بنسبة كل واحد
// (الباقي من credit = خصم المكافأة)
export function splitWalletValue(uses, walletPay) {
  const total = uses.reduce((s, u) => s + u.credit, 0);
  let left = round(walletPay, 2);
  return uses.map((u, i) => {
    const value =
      i === uses.length - 1
        ? left
        : round((walletPay * u.credit) / (total || 1), 2);
    left = round(left - value, 2);
    return { ...u, value, bonus: round(u.credit - value, 2) };
  });
}

// ------------------------------------------------------------
// اشتراكات العميل (نافذة الاشتراكات في الكاشير)
// ------------------------------------------------------------
export async function customerWallets(customerId) {
  await assertModule("laundry");
  const [customer, wallets] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, code: true, arName: true, enName: true, phone: true },
    }),
    prisma.laundryWallet.findMany({
      where: { customerId },
      orderBy: { id: "desc" },
      take: 100,
      select: {
        id: true,
        number: true,
        paidAmount: true,
        creditAmount: true,
        remaining: true,
        expiresAt: true,
        status: true,
        notes: true,
        createdAt: true,
        voucher: { select: { id: true, number: true } },
        branch: { select: { arName: true, enName: true } },
        uses: {
          orderBy: { id: "desc" },
          select: {
            id: true,
            credit: true,
            value: true,
            bonus: true,
            createdAt: true,
            sale: { select: { id: true, type: true, number: true } },
          },
        },
      },
    }),
  ]);
  if (!customer) throw new AppError("CustomerNotFound");
  const todayDb = dayToDbDate(today());
  const rows = wallets.map((w) => {
    const expired =
      w.status === "active" && w.expiresAt && w.expiresAt < todayDb;
    return {
      ...w,
      paidAmount: n(w.paidAmount),
      creditAmount: n(w.creditAmount),
      remaining: n(w.remaining),
      expiresAt: w.expiresAt ? dbDateToDay(w.expiresAt) : null,
      status: expired ? "expired" : w.status,
      uses: w.uses.map((u) => ({
        ...u,
        credit: n(u.credit),
        value: n(u.value),
        bonus: n(u.bonus),
      })),
    };
  });
  const balance = round(
    rows
      .filter((w) => w.status === "active")
      .reduce((s, w) => s + w.remaining, 0),
    2,
  );
  return { customer, balance, wallets: rows };
}

// ------------------------------------------------------------
// اشتراك جديد: سند قبض بالمدفوع + رصيد بالمشحون
// العميل بالجوال (لو مش مسجل بيتسجل) أو بالـ id
// ------------------------------------------------------------
export async function createWallet(data, user) {
  await assertModule("laundry");
  const paid = round(data.paidAmount, 2);
  const credit = round(data.creditAmount, 2);
  if (!(paid > 0))
    throw new AppError("MustBePositive", null, { paidAmount: "MustBePositive" });
  if (credit < paid)
    throw new AppError("LaundryCreditBelowPaid", null, {
      creditAmount: "LaundryCreditBelowPaid",
    });
  // الاشتراك لازم باسم العميل وجواله: العميل الجديد (أو المسجل بالجوال بس
  // واسمه = الجوال) لازم يتكتب اسمه، والمسجل بالجوال بس اسمه بيتحدث
  const name = data.customerName?.trim() || null;
  const existing = data.customerId
    ? await prisma.customer.findUnique({
        where: { id: data.customerId },
        select: { id: true, arName: true, phone: true },
      })
    : await prisma.customer.findUnique({
        where: { phone: data.phone },
        select: { id: true, arName: true, phone: true },
      });
  const noName = !existing || !existing.arName || existing.arName === existing.phone;
  if (noName && (!name || name.length < 3))
    throw new AppError("LaundryWalletNameRequired", null, {
      customerName: "LaundryWalletNameRequired",
    });
  if (existing && noName)
    await prisma.customer.update({
      where: { id: existing.id },
      data: { arName: name, enName: name },
    });
  const customer = await resolveCustomer({
    customerId: data.customerId ?? null,
    phone: data.phone,
    customerName: name,
  });
  const { months } = await getWalletSettings();
  // الفلوس: سند قبض (إيراد متنوع) بيدخل الدرج زي أي سند
  const voucher = await createVoucher(
    {
      type: "receipt",
      partyType: "other",
      partyName: `اشتراك مغسلة - ${customer.arName} (${data.phone})`.slice(
        0,
        255,
      ),
      paymentMethodId: data.paymentMethodId,
      amount: paid,
      reference: data.reference ?? null,
      notes: data.notes ?? null,
      requestId: data.requestId ?? null,
    },
    user,
  );
  try {
    const wallet = await runTx(async (tx) => {
      const seq = await tx.documentSequence.upsert({
        where: { key: SEQ_KEY },
        create: { key: SEQ_KEY, last: 1 },
        update: { last: { increment: 1 } },
        select: { last: true },
      });
      return tx.laundryWallet.create({
        data: {
          number: seq.last,
          customerId: customer.id,
          branchId: user.branch.id,
          paidAmount: paid,
          creditAmount: credit,
          remaining: credit,
          expiresAt: months > 0 ? dayToDbDate(addMonths(today(), months)) : null,
          voucherId: voucher.id,
          notes: data.notes ?? null,
          createdById: user.id,
        },
        select: { id: true, number: true, expiresAt: true },
      });
    });
    return {
      ...wallet,
      expiresAt: wallet.expiresAt ? dbDateToDay(wallet.expiresAt) : null,
      voucher,
      customer,
      paidAmount: paid,
      creditAmount: credit,
      balance: await walletBalance(customer.id),
    };
  } catch (e) {
    // الرصيد ما اتعملش ← السند يتلغي (العملية كلها يا تتم يا لأ)
    await deleteVoucher(voucher.id, user).catch(() => {});
    throw e;
  }
}

// إلغاء اشتراك ما اتصرفش منه حاجة: السند بيتلغي (ممنوع لو ورديته اتقفلت)
export async function cancelWallet(id, user) {
  await assertModule("laundry");
  const w = await prisma.laundryWallet.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      voucherId: true,
      _count: { select: { uses: true } },
    },
  });
  if (!w) throw new AppError("LaundryWalletNotFound");
  if (w._count.uses || w.status !== "active")
    throw new AppError("LaundryWalletUsed");
  if (w.voucherId) await deleteVoucher(w.voucherId, user);
  await prisma.laundryWallet.update({
    where: { id },
    data: { status: "cancelled", remaining: 0 },
  });
  return { id };
}
