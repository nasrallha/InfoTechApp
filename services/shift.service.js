import "server-only";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/transaction";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { round } from "@/lib/invoice-calc";
import { getBaseCurrency } from "./currency.service";
import { getDayStartHour } from "@/lib/business-day-server";
import { bizToday } from "@/lib/business-day";
import { dayToDbDate, isDay } from "@/lib/dates";

// ============================================================
// ورديات الكاشير
// - الكاشير يفتح وردية برصيد أول المدة (الفلوس اللي استلمها في الدرج)
// - كل فاتورة/مرتجع من شاشة الكاشير تُسجل على ورديته
// - القفل: يعدّ الفلوس اللي في الدرج، والبرنامج يقارنها بالمفروض
//   المفروض = أول المدة + المقبوض نقداً - المردود نقداً
//             + سندات القبض النقدية - سندات الصرف النقدية + الإضافة - السحب
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));

async function nextShiftNumber(tx) {
  const seq = await tx.documentSequence.upsert({
    where: { key: "shift" },
    create: { key: "shift", last: 1 },
    update: { last: { increment: 1 } },
    select: { last: true },
  });
  return seq.last;
}

const userSelect = { select: { id: true, arFullname: true, enFullname: true } };
const shiftSelect = {
  id: true,
  number: true,
  status: true,
  branchId: true,
  branch: { select: { id: true, arName: true, enName: true } },
  userId: true,
  user: userSelect,
  openedAt: true,
  openingCash: true,
  // ترتيب الوردية في يوم العمل (الوردية 1 / 2 / 3) لكل فرع
  businessDay: true,
  dayNo: true,
  closedAt: true,
  closedBy: userSelect,
  expectedCash: true,
  countedCash: true,
  difference: true,
  previousShiftId: true,
  expectedOpening: true,
  openingDifference: true,
  denominations: true,
  cardExpected: true,
  cardCounted: true,
  cardDifference: true,
  depositedCash: true,
  leftCash: true,
  notes: true,
};

// وردية المستخدم المفتوحة (على أي فرع)
export async function getOpenShift(user) {
  return prisma.shift.findFirst({
    where: { userId: user.id, status: "open" },
    orderBy: { id: "desc" },
    select: shiftSelect,
  });
}

// آخر وردية مقفولة على الفرع: المتروك في الدرج هو المفروض استلامه
async function previousShift(branchId, db = prisma) {
  return db.shift.findFirst({
    where: { branchId, status: "closed" },
    orderBy: [{ closedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      number: true,
      leftCash: true,
      closedAt: true,
      user: userSelect,
    },
  });
}

// للنافذة: المبلغ المقترح لرصيد أول المدة (المتروك من الوردية السابقة)
export async function getOpeningSuggestion(user) {
  const prev = await previousShift(user.branch.id);
  return prev
    ? {
        previousShiftId: prev.id,
        previousNumber: prev.number,
        previousCashier: prev.user,
        closedAt: prev.closedAt,
        leftCash: n(prev.leftCash),
      }
    : null;
}

// فتح وردية جديدة (المستخدم له وردية واحدة مفتوحة فقط)
// رصيد أول المدة = ما عدّه الكاشير في الدرج، ويُقارن بالمتروك من الوردية السابقة
// ترتيب الوردية في يوم العمل: بعد آخر وردية في نفس الفرع ونفس اليوم
// (يوم العمل حسب "بداية يوم العمل" في الإعدادات العامة)
async function nextDayNo(tx, branchId, day) {
  const last = await tx.shift.findFirst({
    where: { branchId, businessDay: dayToDbDate(day) },
    orderBy: { dayNo: "desc" },
    select: { dayNo: true },
  });
  return (last?.dayNo ?? 0) + 1;
}

// اتنين فتحوا في نفس اللحظة على نفس الفرع ← نفس الترتيب ← نعيد المحاولة
const isDayNoClash = (e) => e?.code === "P2002";

export async function openShift(input, user) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await openShiftOnce(input, user);
    } catch (e) {
      if (attempt >= 3 || !isDayNoClash(e)) throw e;
    }
  }
}

async function openShiftOnce({ openingCash, notes }, user) {
  const currency = await getBaseCurrency();
  const d = currency.decimals ?? 2;
  const day = bizToday(await getDayStartHour());
  return runTx(async (tx) => {
    const open = await tx.shift.findFirst({
      where: { userId: user.id, status: "open" },
      select: { id: true },
    });
    if (open) throw new AppError("ShiftAlreadyOpen");
    const prev = await previousShift(user.branch.id, tx);
    const expected = prev ? round(n(prev.leftCash), d) : null;
    const opening = round(openingCash ?? 0, d);
    const number = await nextShiftNumber(tx);
    const dayNo = await nextDayNo(tx, user.branch.id, day);
    return tx.shift.create({
      data: {
        number,
        branchId: user.branch.id,
        userId: user.id,
        openedAt: new Date(),
        businessDay: dayToDbDate(day),
        dayNo,
        openingCash: opening,
        previousShiftId: prev?.id ?? null,
        expectedOpening: expected,
        openingDifference:
          expected == null ? null : round(opening - expected, d),
        notes,
      },
      select: shiftSelect,
    });
  });
}

// ------------------------------------------------------------
// ملخص الوردية: الفواتير والمرتجعات، والمدفوع بكل طريقة، والنقدية المفروضة
// ------------------------------------------------------------
export async function shiftSummary(shiftId, db = prisma) {
  const shift = await db.shift.findUnique({
    where: { id: shiftId },
    select: { openingCash: true },
  });
  const sales = await db.sale.findMany({
    where: { shiftId },
    select: {
      type: true,
      totalAmount: true,
      taxAmount: true,
      remainingAmount: true,
      payments: {
        select: {
          amount: true,
          paymentMethodId: true,
          paymentMethod: { select: { arName: true, enName: true, type: true } },
        },
      },
    },
  });

  const sum = {
    sales: 0,
    returns: 0,
    salesCount: 0,
    returnsCount: 0,
    tax: 0,
    credit: 0,
  };
  const byMethod = new Map();
  for (const s of sales) {
    const sign = s.type === "return" ? -1 : 1;
    if (sign > 0) {
      sum.sales += n(s.totalAmount);
      sum.salesCount++;
    } else {
      sum.returns += n(s.totalAmount);
      sum.returnsCount++;
    }
    sum.tax += sign * n(s.taxAmount);
    sum.credit += sign * n(s.remainingAmount);
    for (const p of s.payments) {
      const row = byMethod.get(p.paymentMethodId) ?? {
        id: p.paymentMethodId,
        arName: p.paymentMethod.arName,
        enName: p.paymentMethod.enName,
        type: p.paymentMethod.type,
        received: 0,
        refunded: 0,
      };
      if (sign > 0) row.received += n(p.amount);
      else row.refunded += n(p.amount);
      byMethod.set(p.paymentMethodId, row);
    }
  }
  const methods = [...byMethod.values()].map((m) => ({
    ...m,
    received: round(m.received),
    refunded: round(m.refunded),
    net: round(m.received - m.refunded),
  }));
  const cashIn = methods
    .filter((m) => m.type === "cash")
    .reduce((s, m) => s + m.net, 0);
  const cardNet = methods
    .filter((m) => m.type === "card")
    .reduce((s, m) => s + m.net, 0);
  const openingCash = n(shift?.openingCash);

  // السندات النقدية من الدرج + السحب والإضافة
  const [vouchers, movements] = await Promise.all([
    db.voucher.groupBy({
      by: ["type"],
      where: { shiftId },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.cashMovement.findMany({
      where: { shiftId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        type: true,
        amount: true,
        reason: true,
        createdAt: true,
        createdBy: userSelect,
      },
    }),
  ]);
  const vSum = (type) => n(vouchers.find((v) => v.type === type)?._sum.amount);
  const vCount = (type) =>
    vouchers.find((v) => v.type === type)?._count._all ?? 0;
  const receiptsCash = round(vSum("receipt"));
  const paymentsCash = round(vSum("payment"));
  const cashAdded = round(
    movements
      .filter((m) => m.type === "in")
      .reduce((s, m) => s + n(m.amount), 0),
  );
  const cashWithdrawn = round(
    movements
      .filter((m) => m.type === "out")
      .reduce((s, m) => s + n(m.amount), 0),
  );

  return {
    receiptsCash,
    receiptsCount: vCount("receipt"),
    paymentsCash,
    paymentsCount: vCount("payment"),
    cashAdded,
    cashWithdrawn,
    movements: movements.map((m) => ({ ...m, amount: n(m.amount) })),
    cardExpected: round(cardNet),
    salesCount: sum.salesCount,
    returnsCount: sum.returnsCount,
    salesTotal: round(sum.sales),
    returnsTotal: round(sum.returns),
    netTotal: round(sum.sales - sum.returns),
    taxTotal: round(sum.tax),
    creditTotal: round(sum.credit),
    methods,
    openingCash,
    cashNet: round(cashIn),
    expectedCash: round(
      openingCash +
        cashIn +
        receiptsCash -
        paymentsCash +
        cashAdded -
        cashWithdrawn,
    ),
  };
}

// مين يقدر يشوف/يقفل الوردية
function canManage(shift, user) {
  if (shift.userId === user.id) return true;
  if (!can(user, "shifts.close")) return false;
  return can(user, "allBranches.view") || shift.branchId === user.branch.id;
}

// فئات العدّ (ورق) + الفكة (مبلغ)
export const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 1];

// إجمالي العدّ من الفئات: { "500": 2, "100": 3, coins: 12.5 }
export function countDenominations(den) {
  if (!den) return 0;
  let total = 0;
  for (const d of DENOMINATIONS) total += d * (Number(den[d]) || 0);
  total += Number(den.coins) || 0;
  return total;
}

// قفل الوردية:
// - عدّ الفلوس بالفئات (العدّ الأعمى: الكاشير لا يرى المفروض إلا بصلاحية)
// - إجمالي إيصال تقفيل جهاز الشبكة مقارنة بمبيعات الشبكة
// - التسليم: المورّد للخزنة، والباقي يُترك في الدرج للوردية التالية
export async function closeShift(
  { id, denominations, countedCash, cardCounted, depositedCash, notes },
  user,
) {
  const currency = await getBaseCurrency();
  const d = currency.decimals ?? 2;
  return runTx(async (tx) => {
    const shift = await tx.shift.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        branchId: true,
        status: true,
        notes: true,
      },
    });
    if (!shift) throw new AppError("ShiftNotFound");
    if (!canManage(shift, user)) throw new AppError("Forbidden");
    if (shift.status !== "open") throw new AppError("ShiftClosed");

    const summary = await shiftSummary(id, tx);
    const counted = round(
      denominations ? countDenominations(denominations) : countedCash,
      d,
    );
    const deposited = round(depositedCash ?? 0, d);
    if (deposited > counted + 0.0001) {
      throw new AppError("DepositExceedsCash", null, {
        depositedCash: "DepositExceedsCash",
      });
    }
    const card = cardCounted == null ? null : round(cardCounted, d);
    const { count } = await tx.shift.updateMany({
      where: { id, status: "open" },
      data: {
        status: "closed",
        closedAt: new Date(),
        closedById: user.id,
        expectedCash: summary.expectedCash,
        countedCash: counted,
        difference: round(counted - summary.expectedCash, d),
        denominations: denominations ?? undefined,
        cardExpected: summary.cardExpected,
        cardCounted: card,
        cardDifference:
          card == null ? null : round(card - summary.cardExpected, d),
        depositedCash: deposited,
        leftCash: round(counted - deposited, d),
        notes: notes ?? shift.notes,
      },
    });
    if (!count) throw new AppError("ShiftClosed");
    return { id };
  });
}

// ------------------------------------------------------------
// سحب / إضافة نقدية في الدرج (على وردية المستخدم المفتوحة)
// السحب لا يتجاوز النقدية المفروضة في الدرج
// ------------------------------------------------------------
export async function addCashMovement({ type, amount, reason }, user) {
  const currency = await getBaseCurrency();
  const d = currency.decimals ?? 2;
  return runTx(async (tx) => {
    const shift = await tx.shift.findFirst({
      where: { userId: user.id, status: "open" },
      select: { id: true, branchId: true },
    });
    if (!shift) throw new AppError("ShiftRequired");
    // نقفل صف الوردية حتى لا يسحب اتنين في نفس اللحظة
    await tx.shift.update({
      where: { id: shift.id },
      data: { updatedAt: new Date() },
    });
    const value = round(amount, d);
    if (type === "out") {
      const summary = await shiftSummary(shift.id, tx);
      if (value > summary.expectedCash + 0.0001) {
        throw new AppError("WithdrawExceedsCash", null, {
          amount: "WithdrawExceedsCash",
        });
      }
    }
    return tx.cashMovement.create({
      data: {
        type,
        shiftId: shift.id,
        branchId: shift.branchId,
        amount: value,
        reason: reason ?? null,
        createdById: user.id,
      },
      select: { id: true, type: true, amount: true },
    });
  });
}

// الورديات: صاحب الصلاحية يرى ورديات فرعه (أو كل الفروع)، وغيره وردياته فقط
function shiftScope(user) {
  if (!can(user, "shifts.view")) return { userId: user.id };
  if (can(user, "allBranches.view")) return {};
  return { branchId: user.branch.id };
}

// البحث: اليوم (يوم العمل) + ترتيب الوردية فيه ← الوردية برقمها الأساسي
export async function listShifts({
  user,
  status,
  day,
  dayNo,
  page = 1,
  pageSize = 20,
}) {
  const where = {
    ...shiftScope(user),
    ...(status ? { status } : {}),
    ...(isDay(day) ? { businessDay: dayToDbDate(day) } : {}),
    ...(isDay(day) && dayNo ? { dayNo } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.shift.count({ where }),
    prisma.shift.findMany({
      where,
      orderBy: isDay(day)
        ? [{ branchId: "asc" }, { dayNo: "asc" }]
        : { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { ...shiftSelect, _count: { select: { sales: true } } },
    }),
  ]);
  return { total, page, pageSize, rows };
}

export async function getShift(id, user) {
  const shift = await prisma.shift.findFirst({
    where: { id, ...shiftScope(user) },
    select: shiftSelect,
  });
  if (!shift) return null;
  const summary = await shiftSummary(id);
  const open = shift.status === "open";
  // العدّ الأعمى: الوردية المفتوحة لا يظهر فيها المفروض إلا بصلاحية
  const blind = open && !can(user, "shifts.viewExpected");
  return {
    ...shift,
    summary: blind ? hideExpected(summary) : summary,
    blind,
    canClose: open && canManage(shift, user),
  };
}

function hideExpected(summary) {
  return {
    ...summary,
    methods: summary.methods.map((m) => ({
      ...m,
      received: null,
      refunded: null,
      net: null,
    })),
    cashNet: null,
    expectedCash: null,
    cardExpected: null,
    salesTotal: null,
    returnsTotal: null,
    netTotal: null,
    taxTotal: null,
    creditTotal: null,
  };
}
