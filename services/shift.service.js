import "server-only";
import { nextBranchNumber } from "./sequence.service";
import { docSign } from "@/lib/doc-number";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/transaction";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { round } from "@/lib/invoice-calc";
import { getBaseCurrency } from "./currency.service";
import { getDayStartHour } from "@/lib/business-day-server";
import { bizToday } from "@/lib/business-day";
import { dayToDbDate, isDay } from "@/lib/dates";
import { normalizeShiftSettings, periodAt } from "@/lib/shift-settings";

// ============================================================
// وردية الفرع وأدراج الكاشير
// - وردية الفرع (branch_shifts): الفترة، واحدة مفتوحة في الفرع، وجواها الأدراج
// - درج الكاشير (shifts): لكل كاشير برصيد أول المدة، وفواتيره ومصروفاته عليه
//   (أي كاشير بيفتح درجه، ولو مفيش وردية فرع مفتوحة بتتفتح معاه)
// - الانضمام: المدير / المشرف / المالك يبيع على درج كاشير مفتوح (بصلاحية)
// - القفل: كل كاشير يعدّ درجه، والبرنامج يقارنه بالمفروض
//   المفروض = أول المدة + المقبوض نقداً - المردود نقداً
//             + سندات القبض النقدية - سندات الصرف النقدية + الإضافة - السحب
//   وردية الفرع بتتقفل مع آخر درج (أو يدوي حسب الإعدادات)
// ============================================================

// إعدادات الورديات (المالك)
export async function getShiftSettings(db = prisma) {
  const s = await db.systemSettings.findUnique({
    where: { id: 1 },
    select: { shiftSettings: true },
  });
  return normalizeShiftSettings(s?.shiftSettings);
}

export async function saveShiftSettings(data) {
  const value = normalizeShiftSettings(data);
  await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, shiftSettings: value },
    update: { shiftSettings: value },
  });
  return value;
}

// ------------------------------------------------------------
// الدرج اللي المستخدم بيبيع عليه دلوقتي: درجه المفتوح، أو الدرج اللي منضم له
// ← { id, branchId, joined } أو null
// ------------------------------------------------------------
export async function activeDrawer(user, db = prisma) {
  const own = await db.shift.findFirst({
    where: { userId: user.id, status: "open" },
    orderBy: { id: "desc" },
    select: { id: true, branchId: true },
  });
  if (own) return { ...own, joined: false };
  const join = await db.drawerJoin.findFirst({
    where: { userId: user.id, leftAt: null, shift: { status: "open" } },
    orderBy: { id: "desc" },
    select: { shift: { select: { id: true, branchId: true } } },
  });
  return join ? { ...join.shift, joined: true } : null;
}

// الدرج على فرع المستخدم الحالي بس (الفواتير والسندات)
export async function activeDrawerId(user, db = prisma) {
  const d = await activeDrawer(user, db);
  return d && d.branchId === user.branch.id ? d.id : null;
}

const n = (v) => (v == null ? 0 : Number(v));

// الرقم التالي في فرع الوردية + رمز الفرع (DM-SH-5) - مفيش تكرار
async function nextShiftNumber(tx, branchId) {
  return nextBranchNumber(tx, "shift", branchId);
}

const userSelect = { select: { id: true, arFullname: true, enFullname: true } };
const shiftSelect = {
  id: true,
  number: true, docCode: true,
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
  branchShiftId: true,
  branchShift: {
    select: { id: true, status: true, periodArName: true, periodEnName: true, dayNo: true, businessDay: true },
  },
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

// الدرج اللي المستخدم بيبيع عليه (درجه أو المنضم له) + joined
export async function getOpenShift(user) {
  const d = await activeDrawer(user);
  if (!d) return null;
  const shift = await prisma.shift.findUnique({ where: { id: d.id }, select: shiftSelect });
  return shift ? { ...shift, joined: d.joined } : null;
}

// آخر درج مقفول: المتروك فيه هو المفروض استلامه
// (درج نفس الكاشير على الفرع الأول، ولو مفيش: آخر درج اتقفل على الفرع)
async function previousShift(branchId, db = prisma, userId = null) {
  const sel = {
    orderBy: [{ closedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      number: true, docCode: true,
      leftCash: true,
      closedAt: true,
      user: userSelect,
    },
  };
  const own = userId
    ? await db.shift.findFirst({ where: { branchId, status: "closed", userId }, ...sel })
    : null;
  return own ?? db.shift.findFirst({ where: { branchId, status: "closed" }, ...sel });
}

// للنافذة: المبلغ المقترح لرصيد أول المدة (المتروك من الوردية السابقة)
export async function getOpeningSuggestion(user) {
  const prev = await previousShift(user.branch.id, prisma, user.id);
  return prev
    ? {
        previousShiftId: prev.id,
        previousNumber: prev.number,
        previousDocCode: prev.docCode ?? null,
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
  const last = await tx.branchShift.findFirst({
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

// وردية الفرع المفتوحة (الأحدث لو فيه أكتر من واحدة من البيانات القديمة)
function openBranchShift(branchId, db = prisma) {
  return db.branchShift.findFirst({
    where: { branchId, status: "open" },
    orderBy: { id: "desc" },
    select: { id: true, businessDay: true, dayNo: true, periodArName: true, periodEnName: true, openedAt: true },
  });
}

async function openShiftOnce({ openingCash, notes }, user) {
  const currency = await getBaseCurrency();
  const d = currency.decimals ?? 2;
  const [dayStart, settings] = await Promise.all([getDayStartHour(), getShiftSettings()]);
  const day = bizToday(dayStart);
  return runTx(async (tx) => {
    if (await activeDrawer(user, tx)) throw new AppError("ShiftAlreadyOpen");
    const branchId = user.branch.id;
    // وردية الفرع: المفتوحة، أو تتفتح دلوقتي مع الدرج (أي كاشير يقدر)
    let bs = await openBranchShift(branchId, tx);
    if (bs && !settings.multiDrawer) {
      const busy = await tx.shift.count({ where: { branchShiftId: bs.id, status: "open" } });
      if (busy) throw new AppError("BranchShiftSingleDrawer");
    }
    if (!bs) {
      const period = periodAt(settings.periods);
      bs = await tx.branchShift.create({
        data: {
          branchId,
          businessDay: dayToDbDate(day),
          dayNo: await nextDayNo(tx, branchId, day),
          periodArName: period?.arName ?? null,
          periodEnName: period?.enName || null,
          openedAt: new Date(),
          openedById: user.id,
        },
        select: { id: true, businessDay: true, dayNo: true },
      });
    }
    const prev = await previousShift(branchId, tx, user.id);
    const expected = prev ? round(n(prev.leftCash), d) : null;
    const opening = round(openingCash ?? 0, d);
    const { number, docCode } = await nextShiftNumber(tx, branchId);
    return tx.shift.create({
      data: {
        number,
        docCode,
        branchId,
        userId: user.id,
        branchShiftId: bs.id,
        openedAt: new Date(),
        // اليوم والترتيب من وردية الفرع (كل الأدراج جواها ليها نفس الترتيب)
        businessDay: bs.businessDay,
        dayNo: bs.dayNo,
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
    // الإشعار الدائن زي المرتجع (فلوس بترجع)، والمدين زي البيع
    const sign = docSign(s.type);
    if (sign > 0) {
      sum.sales += n(s.totalAmount);
      if (s.type === "sale") sum.salesCount++;
    } else {
      sum.returns += n(s.totalAmount);
      if (s.type === "return") sum.returnsCount++;
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

// مين يقدر يشوف/يقفل الدرج
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
        branchShiftId: true,
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
    // المنضمين للدرج بيخرجوا منه
    await tx.drawerJoin.updateMany({ where: { shiftId: id, leftAt: null }, data: { leftAt: new Date() } });
    // آخر درج في وردية الفرع ← الوردية بتتقفل (لو الإعداد كده)
    if (shift.branchShiftId) {
      const settings = await getShiftSettings(tx);
      if (settings.autoClose) await closeBranchShiftIfDone(tx, shift.branchShiftId, user);
    }
    return { id };
  });
}

// وردية الفرع من غير أدراج مفتوحة ← تتقفل
async function closeBranchShiftIfDone(tx, branchShiftId, user) {
  const open = await tx.shift.count({ where: { branchShiftId, status: "open" } });
  if (open) return false;
  const { count } = await tx.branchShift.updateMany({
    where: { id: branchShiftId, status: "open" },
    data: { status: "closed", closedAt: new Date(), closedById: user.id },
  });
  return count > 0;
}

// قفل وردية الفرع يدوي (المدير / المشرف): لازم كل الأدراج تكون اتقفلت
export async function closeBranchShift(id, user) {
  return runTx(async (tx) => {
    const bs = await tx.branchShift.findUnique({ where: { id }, select: { id: true, branchId: true, status: true } });
    if (!bs) throw new AppError("ShiftNotFound");
    if (!can(user, "allBranches.view") && bs.branchId !== user.branch.id) throw new AppError("Forbidden");
    if (bs.status !== "open") throw new AppError("ShiftClosed");
    if (!(await closeBranchShiftIfDone(tx, id, user))) throw new AppError("BranchShiftHasOpenDrawers");
    return { id };
  });
}

// ------------------------------------------------------------
// الانضمام لدرج كاشير مفتوح على نفس الفرع (الصلاحية في الـ action)
// ------------------------------------------------------------
export async function joinDrawer(shiftId, user) {
  return runTx(async (tx) => {
    if (await activeDrawer(user, tx)) throw new AppError("ShiftAlreadyOpen");
    const shift = await tx.shift.findUnique({
      where: { id: shiftId },
      select: { id: true, status: true, branchId: true },
    });
    if (!shift || shift.status !== "open") throw new AppError("ShiftClosed");
    if (shift.branchId !== user.branch.id) throw new AppError("ShiftOtherBranch");
    await tx.drawerJoin.create({ data: { shiftId, userId: user.id } });
    return { id: shiftId };
  });
}

// الخروج من الدرج المنضم له
export async function leaveDrawer(user) {
  const { count } = await prisma.drawerJoin.updateMany({
    where: { userId: user.id, leftAt: null },
    data: { leftAt: new Date() },
  });
  return { left: count };
}

// نافذة الكاشير لما المستخدم ماعندوش درج: وردية الفرع المفتوحة وأدراجها
export async function drawerChoices(user) {
  const settings = await getShiftSettings();
  const bs = await openBranchShift(user.branch.id);
  const drawers = bs
    ? await prisma.shift.findMany({
        where: { branchShiftId: bs.id, status: "open" },
        orderBy: { openedAt: "asc" },
        select: { id: true, number: true, docCode: true, openedAt: true, user: userSelect },
      })
    : [];
  return {
    branchShift: bs,
    drawers,
    // درج واحد للفرع ومفتوح ← مفيش درج جديد (الانضمام بس)
    canOpen: !(bs && !settings.multiDrawer && drawers.length),
    canJoin: can(user, "shifts.joinDrawer"),
  };
}

// ------------------------------------------------------------
// سحب / إضافة نقدية في الدرج (على وردية المستخدم المفتوحة)
// السحب لا يتجاوز النقدية المفروضة في الدرج
// ------------------------------------------------------------
export async function addCashMovement({ type, amount, reason }, user) {
  const currency = await getBaseCurrency();
  const d = currency.decimals ?? 2;
  return runTx(async (tx) => {
    const shift = await activeDrawer(user, tx);
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

// ============================================================
// ورديات الفرع: القايمة والتقرير المجمّع (كل الأدراج)
// ============================================================
const branchShiftSelect = {
  id: true,
  status: true,
  branchId: true,
  branch: { select: { id: true, arName: true, enName: true } },
  businessDay: true,
  dayNo: true,
  periodArName: true,
  periodEnName: true,
  openedAt: true,
  openedBy: userSelect,
  closedAt: true,
  closedBy: userSelect,
};

// صاحب الصلاحية: ورديات فرعه (أو كل الفروع) / غيره: الورديات اللي ليه فيها درج
function branchShiftScope(user) {
  if (!can(user, "shifts.view")) return { drawers: { some: { userId: user.id } } };
  if (can(user, "allBranches.view")) return {};
  return { branchId: user.branch.id };
}

export async function listBranchShifts({ user, status, day, dayNo, page = 1, pageSize = 20 }) {
  const where = {
    ...branchShiftScope(user),
    ...(status ? { status } : {}),
    ...(isDay(day) ? { businessDay: dayToDbDate(day) } : {}),
    ...(isDay(day) && dayNo ? { dayNo } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.branchShift.count({ where }),
    prisma.branchShift.findMany({
      where,
      orderBy: isDay(day) ? [{ branchId: "asc" }, { dayNo: "asc" }] : { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        ...branchShiftSelect,
        drawers: {
          select: { id: true, status: true, difference: true, _count: { select: { sales: true } } },
        },
      },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    rows: rows.map(({ drawers, ...r }) => ({
      ...r,
      drawersCount: drawers.length,
      openDrawers: drawers.filter((x) => x.status === "open").length,
      invoices: drawers.reduce((s, x) => s + x._count.sales, 0),
      // فرق الأدراج المقفولة بس
      difference: round(
        drawers.reduce((s, x) => s + (x.status === "closed" ? n(x.difference) : 0), 0),
      ),
    })),
  };
}

// جمع ملخصات الأدراج في ملخص واحد (نفس شكل ملخص الدرج)
const SUM_KEYS = [
  "receiptsCash",
  "receiptsCount",
  "paymentsCash",
  "paymentsCount",
  "cashAdded",
  "cashWithdrawn",
  "cardExpected",
  "salesCount",
  "returnsCount",
  "salesTotal",
  "returnsTotal",
  "netTotal",
  "taxTotal",
  "creditTotal",
  "openingCash",
  "cashNet",
  "expectedCash",
];

function mergeSummaries(list) {
  const out = Object.fromEntries(SUM_KEYS.map((k) => [k, 0]));
  const byMethod = new Map();
  const movements = [];
  for (const s of list) {
    for (const k of SUM_KEYS) out[k] += n(s[k]);
    movements.push(...s.movements);
    for (const m of s.methods) {
      const row = byMethod.get(m.id) ?? { ...m, received: 0, refunded: 0, net: 0 };
      row.received += n(m.received);
      row.refunded += n(m.refunded);
      row.net += n(m.net);
      byMethod.set(m.id, row);
    }
  }
  for (const k of SUM_KEYS) out[k] = round(out[k]);
  return {
    ...out,
    movements,
    methods: [...byMethod.values()].map((m) => ({
      ...m,
      received: round(m.received),
      refunded: round(m.refunded),
      net: round(m.net),
    })),
  };
}

export async function getBranchShift(id, user) {
  const bs = await prisma.branchShift.findFirst({
    where: { id, ...branchShiftScope(user) },
    select: {
      ...branchShiftSelect,
      drawers: { orderBy: { openedAt: "asc" }, select: shiftSelect },
    },
  });
  if (!bs) return null;
  const summaries = await Promise.all(bs.drawers.map((x) => shiftSummary(x.id)));
  const seeExpected = can(user, "shifts.viewExpected");
  const drawers = bs.drawers.map((x, i) => {
    const blind = x.status === "open" && !seeExpected;
    return {
      ...x,
      blind,
      expectedCash: blind ? null : summaries[i].expectedCash,
      salesCount: summaries[i].salesCount,
      netTotal: blind ? null : summaries[i].netTotal,
    };
  });
  // العدّ الأعمى: وردية فيها درج مفتوح ← الإجماليات بصلاحية بس
  const blind = drawers.some((x) => x.blind);
  const summary = mergeSummaries(summaries);
  const closed = bs.drawers.filter((x) => x.status === "closed");
  const total = (k) => round(closed.reduce((s, x) => s + n(x[k]), 0));
  return {
    ...bs,
    drawers,
    blind,
    summary: blind ? hideExpected(summary) : summary,
    // العدّ والتسليم: الأدراج المقفولة بس
    counted: {
      countedCash: total("countedCash"),
      expectedCash: total("expectedCash"),
      difference: total("difference"),
      depositedCash: total("depositedCash"),
      leftCash: total("leftCash"),
      cardCounted: total("cardCounted"),
      cardDifference: total("cardDifference"),
    },
    canClose:
      bs.status === "open" &&
      can(user, "shifts.close") &&
      drawers.every((x) => x.status !== "open") &&
      (can(user, "allBranches.view") || bs.branchId === user.branch.id),
  };
}
