import "server-only";
import { ownsOpening, partyBranchWhere } from "@/lib/party-scope";
import { prisma } from "@/lib/prisma";
import { round } from "@/lib/invoice-calc";
import {
  formatDocNo,
  purchaseDocHref,
  purchaseDocNo,
  saleDocHref,
  saleDocNo,
} from "@/lib/doc-number";

// ============================================================
// أرصدة العملاء والموردين، والفواتير المفتوحة، وكشف الحساب
//
// العميل (موجب = عليه لنا):
//   الرصيد = الافتتاحي + آجل فواتير البيع والإشعارات المدينة
//            - المرتجع والإشعارات الدائنة لحسابه - سندات القبض والتسوية
// المورد (موجب = له علينا):
//   الرصيد = الافتتاحي + آجل فواتير الشراء والإشعارات المدينة
//            - المرتجع والإشعارات الدائنة لحسابنا - سندات الصرف والتسوية
//
// المفتوح في كل فاتورة (أو إشعار مدين) = آجلها - المسدد عليها بسندات
//   - مرتجعاتها وإشعاراتها الدائنة لحساب الطرف
// الإشعار الدائن من غير فاتورة: بيتخصم من الأقدم (الافتتاحي ثم الفواتير)
// السند يسدد من الأقدم: الرصيد الافتتاحي أولاً ثم الفواتير بالتاريخ
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const EPS = 0.0001;

const PARTY = {
  customer: {
    model: "customer",
    doc: "sale",
    docModel: "sale",
    // فواتير / مدين (عليه) ← مرتجعات / دائن (له)
    docTypes: ["sale", "debit"],
    creditTypes: ["return", "credit"],
    key: "customerId",
    allocKey: "saleId",
    // المقاصة (offset): بتقلل رصيد العميل والمورد مع بعض
    voucherTypes: ["receipt", "settlement", "offset"],
  },
  supplier: {
    model: "supplier",
    doc: "purchase",
    docModel: "purchase",
    docTypes: ["purchase", "debit"],
    creditTypes: ["return", "credit"],
    key: "supplierId",
    allocKey: "purchaseId",
    voucherTypes: ["payment", "settlement", "offset"],
  },
};

// رصيد طرف (عميل أو مورد) حالياً، أو قبل تاريخ معيّن (before)
// excludeVoucherId: الرصيد من غير سند معيّن (شاشة تعديل السند)
// branchId: حركات فرع واحد بس (كشف موظف الفرع)، والرصيد الافتتاحي
//   بيتحسب لو الطرف نفسه مسجّل على الفرع ده
export async function partyBalance(
  kind,
  id,
  { before, db = prisma, excludeVoucherId, branchId } = {},
) {
  const P = PARTY[kind];
  const party = await db[P.model].findUnique({
    where: { id },
    select: {
      openingBalance: true,
      allBranches: true,
      branches: { select: { branchId: true } },
    },
  });
  if (!party) return 0;
  const dateFilter = {
    ...(before ? { date: { lt: before } } : {}),
    ...(branchId ? { branchId } : {}),
  };
  const openingBalance = ownsOpening(party, branchId)
    ? n(party.openingBalance)
    : 0;
  const [docs, returns, vouchers] = await Promise.all([
    db[P.docModel].aggregate({
      where: { [P.key]: id, type: { in: P.docTypes }, ...dateFilter },
      _sum: { remainingAmount: true },
    }),
    db[P.docModel].aggregate({
      where: { [P.key]: id, type: { in: P.creditTypes }, ...dateFilter },
      _sum: { remainingAmount: true },
    }),
    db.voucher.aggregate({
      where: {
        [P.key]: id,
        type: { in: P.voucherTypes },
        ...dateFilter,
        ...(excludeVoucherId ? { id: { not: excludeVoucherId } } : {}),
      },
      _sum: { amount: true },
    }),
  ]);
  return round(
    openingBalance +
      n(docs._sum.remainingAmount) -
      n(returns._sum.remainingAmount) -
      n(vouchers._sum.amount),
    4,
  );
}

// الفواتير المفتوحة (من الأقدم) + المفتوح من الرصيد الافتتاحي
// excludeVoucherId: كأن السند ده مش موجود (شاشة تعديل السند)
export async function openItems(kind, id, db = prisma, excludeVoucherId) {
  const P = PARTY[kind];
  const party = await db[P.model].findUnique({
    where: { id },
    select: { openingBalance: true },
  });
  if (!party) return { opening: 0, invoices: [] };

  const [docs, openingAlloc, loose, excluded] = await Promise.all([
    db[P.docModel].findMany({
      where: {
        [P.key]: id,
        type: { in: P.docTypes },
        remainingAmount: { gt: 0 },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: {
        id: true,
        type: true,
        number: true,
        date: true,
        totalAmount: true,
        remainingAmount: true,
        settledAmount: true,
        // المرتجعات والإشعارات الدائنة على الفاتورة (المدين مش بينقّصها)
        returns: {
          where: { type: { in: P.creditTypes } },
          select: { remainingAmount: true },
        },
      },
    }),
    db.voucherAllocation.aggregate({
      where: {
        [P.allocKey]: null,
        voucher: { [P.key]: id, type: { in: P.voucherTypes } },
        // المقاصة: نصيب الطرف ده بس من توزيع السند
        OR: [{ partySide: null }, { partySide: kind }],
        ...(excludeVoucherId ? { voucherId: { not: excludeVoucherId } } : {}),
      },
      _sum: { amount: true },
    }),
    // الإشعارات الدائنة من غير فاتورة (لحساب الطرف)
    db[P.docModel].aggregate({
      where: { [P.key]: id, type: "credit", returnOfId: null },
      _sum: { remainingAmount: true },
    }),
    excludeVoucherId
      ? db.voucherAllocation.findMany({
          where: { voucherId: excludeVoucherId, [P.allocKey]: { not: null } },
          select: { [P.allocKey]: true, amount: true },
        })
      : [],
  ]);
  // المسدد بالسند المستبعد على كل فاتورة
  const excludedByDoc = new Map(
    excluded.map((a) => [a[P.allocKey], n(a.amount)]),
  );

  const invoices = docs
    .map((d) => {
      const returned = d.returns.reduce((s, r) => s + n(r.remainingAmount), 0);
      const settled = n(d.settledAmount) - (excludedByDoc.get(d.id) ?? 0);
      return {
        id: d.id,
        type: d.type,
        number: d.number,
        docNo:
          kind === "customer"
            ? saleDocNo(d.type, d.number)
            : purchaseDocNo(d.type, d.number),
        date: d.date,
        total: n(d.totalAmount),
        credit: n(d.remainingAmount),
        settled: round(settled, 4),
        returned: round(returned, 4),
        open: round(n(d.remainingAmount) - settled - returned, 4),
      };
    })
    .filter((d) => d.open > EPS);

  // الدائن من غير فاتورة: بيقفل من الأقدم (الافتتاحي ثم الفواتير)
  let opening = round(n(party.openingBalance) - n(openingAlloc._sum.amount), 4);
  let pool = round(n(loose._sum.remainingAmount), 4);
  if (pool > EPS && opening > EPS) {
    const a = Math.min(opening, pool);
    opening = round(opening - a, 4);
    pool = round(pool - a, 4);
  }
  for (const inv of invoices) {
    if (pool <= EPS) break;
    const a = Math.min(inv.open, pool);
    inv.open = round(inv.open - a, 4);
    inv.returned = round(inv.returned + a, 4);
    pool = round(pool - a, 4);
  }

  return { opening, invoices: invoices.filter((d) => d.open > EPS) };
}

// توزيع مبلغ على الأقدم: الافتتاحي ثم الفواتير
// يرجع [{ docId | null, amount }]
export async function allocateFifo(kind, id, amount, db) {
  const { opening, invoices } = await openItems(kind, id, db);
  const rows = [];
  let rest = round(amount, 4);
  if (opening > EPS && rest > EPS) {
    const a = round(Math.min(opening, rest), 4);
    rows.push({ docId: null, amount: a });
    rest = round(rest - a, 4);
  }
  for (const inv of invoices) {
    if (rest <= EPS) break;
    const a = round(Math.min(inv.open, rest), 4);
    rows.push({ docId: inv.id, amount: a });
    rest = round(rest - a, 4);
  }
  // باقي (مثلاً مرتجع لحسابه أكبر من فاتورته): على الرصيد الافتتاحي
  if (rest > EPS) rows.push({ docId: null, amount: rest });
  return rows;
}

// ملخص الطرف لشاشة السند: الرصيد والفواتير المفتوحة
// excludeVoucherId: في تعديل سند (كأنه مش موجود)
export async function getPartyAccount(kind, id, { excludeVoucherId } = {}) {
  const [balance, items] = await Promise.all([
    partyBalance(kind, id, { excludeVoucherId }),
    openItems(kind, id, prisma, excludeVoucherId),
  ]);
  return { balance, ...items };
}

// ============================================================
// كشف الحساب: رصيد أول المدة ثم كل حركة بالرصيد بعدها
// from / to: Date (to = نهاية اليوم)
// ============================================================
// branchId: كشف موظف الفرع (حركات فرعه بس)، وفاضي = كل الفروع
// user: لازم الطرف يكون من أطراف فرعه (أو كل الفروع)
export async function getStatement(
  kind,
  id,
  { from, to, branchId, user } = {},
) {
  const P = PARTY[kind];
  const party = await prisma[P.model].findFirst({
    where: { id, ...partyBranchWhere(user) },
    select: {
      id: true,
      code: true,
      arName: true,
      enName: true,
      phone: true,
      taxNo: true,
      openingBalance: true,
      allBranches: true,
      branches: { select: { branchId: true } },
    },
  });
  if (!party) return null;

  const range = {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
  const branch = branchId ? { branchId } : {};
  const ownOpening = ownsOpening(party, branchId) ? n(party.openingBalance) : 0;
  const opening = from
    ? await partyBalance(kind, id, { before: from, branchId })
    : ownOpening;

  const [docs, vouchers] = await Promise.all([
    prisma[P.docModel].findMany({
      where: { [P.key]: id, date: range, ...branch },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: {
        id: true,
        type: true,
        number: true,
        date: true,
        totalAmount: true,
        paidAmount: true,
        remainingAmount: true,
        notes: true,
        noteReason: true,
        branch: { select: { arName: true, enName: true } },
      },
    }),
    prisma.voucher.findMany({
      where: {
        [P.key]: id,
        type: { in: P.voucherTypes },
        date: range,
        ...branch,
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: {
        id: true,
        type: true,
        number: true,
        date: true,
        amount: true,
        notes: true,
        paymentMethod: { select: { arName: true, enName: true } },
        branch: { select: { arName: true, enName: true } },
      },
    }),
  ]);

  const isSale = kind === "customer";
  const lines = [
    ...docs.map((d) => {
      // المرتجع والإشعار الدائن بيقللوا الرصيد
      const isCredit = P.creditTypes.includes(d.type);
      const docNo = isSale
        ? saleDocNo(d.type, d.number)
        : purchaseDocNo(d.type, d.number);
      const href = isSale
        ? saleDocHref(d.type, d.id)
        : purchaseDocHref(d.type, d.id);
      // الفاتورة / المدين: مدين بالإجمالي ودائن بالمدفوع وقتها
      // المرتجع / الدائن: دائن بالإجمالي ومدين بالمردود نقداً
      return {
        key: `d${d.id}`,
        date: d.date,
        kind:
          d.type === "credit" || d.type === "debit"
            ? `${d.type}Note`
            : d.type === "return"
              ? "return"
              : "invoice",
        docNo,
        href,
        debit: isCredit ? n(d.paidAmount) : n(d.totalAmount),
        credit: isCredit ? n(d.totalAmount) : n(d.paidAmount),
        notes: d.noteReason || d.notes,
        branch: d.branch,
      };
    }),
    ...vouchers.map((v) => ({
      key: `v${v.id}`,
      date: v.date,
      kind: v.type,
      docNo: formatDocNo(v.type, v.number),
      href: `/accounts/vouchers/${v.id}`,
      debit: 0,
      credit: n(v.amount),
      method: v.paymentMethod,
      notes: v.notes,
      branch: v.branch,
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  let balance = opening;
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    balance = round(balance + l.debit - l.credit, 4);
    totalDebit += l.debit;
    totalCredit += l.credit;
    l.balance = balance;
  }
  const { allBranches: _all, branches: _branches, ...partyInfo } = party;
  return {
    party: { ...partyInfo, openingBalance: ownOpening },
    opening,
    lines,
    totalDebit: round(totalDebit, 4),
    totalCredit: round(totalCredit, 4),
    closing: balance,
  };
}

// قائمة العملاء أو الموردين لشاشة كشف الحساب (أطراف فرع المستخدم + كل الفروع)
export async function getStatementParties(kind, user) {
  return prisma[PARTY[kind].model].findMany({
    where: partyBranchWhere(user),
    orderBy: { code: "asc" },
    select: { id: true, code: true, arName: true, enName: true, phone: true },
  });
}

// ============================================================
// العميل اللي هو مورد كمان: كشف حساب مشترك
// - حركات العميل كما هي (مدين = عليه لنا)
// - حركات المورد معكوسة: اللي بيزوّد المستحق للمورد بينقّص صافي اللي عليه لنا
// - الرصيد موجب = صافي عليه لنا / سالب = صافي له علينا
// ============================================================
export async function getCombinedStatement(customerId, supplierId, range) {
  // range: { from, to, branchId, user } (نفس كشف الطرف الواحد)
  const [c, s] = await Promise.all([
    getStatement("customer", customerId, range),
    getStatement("supplier", supplierId, range),
  ]);
  if (!c || !s) return null;
  const lines = [
    ...c.lines.map((l) => ({ ...l, key: `c${l.key}`, side: "customer" })),
    ...s.lines
      // سند المقاصة بيظهر مرة واحدة (من ناحية العميل)
      .filter((l) => l.kind !== "offset")
      .map((l) => ({
        ...l,
        key: `s${l.key}`,
        side: "supplier",
        debit: l.credit,
        credit: l.debit,
      })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  // المقاصة: بتقفل الرصيدين بنفس المبلغ ← ملهاش أثر على الصافي
  for (const l of lines)
    if (l.kind === "offset") {
      l.debit = l.credit;
    }

  const opening = round(c.opening - s.opening, 4);
  let balance = opening;
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    balance = round(balance + l.debit - l.credit, 4);
    totalDebit += l.debit;
    totalCredit += l.credit;
    l.balance = balance;
  }
  return {
    customer: c.party,
    supplier: s.party,
    opening,
    lines,
    totalDebit: round(totalDebit, 4),
    totalCredit: round(totalCredit, 4),
    closing: balance,
    // الرصيدين كل واحد لوحده (للمقاصة)
    customerBalance: c.closing,
    supplierBalance: s.closing,
  };
}

// ربط عميل بمورد (نفس الطرف)، أو فك الربط (supplierId = null)
export async function linkCustomerSupplier(customerId, supplierId) {
  await prisma.$transaction(async (tx) => {
    // المورد ده كان مربوط بعميل تاني ← يتفك من هناك
    if (supplierId)
      await tx.customer.updateMany({
        where: { supplierId, id: { not: customerId } },
        data: { supplierId: null },
      });
    await tx.customer.update({
      where: { id: customerId },
      data: { supplierId },
    });
  });
  return { customerId, supplierId };
}

// أزواج العميل/المورد المربوطة (لاختيار سريع في الكشف المشترك)
export async function getLinkedParties() {
  return prisma.customer.findMany({
    where: { supplierId: { not: null } },
    orderBy: { code: "asc" },
    select: { id: true, supplierId: true },
  });
}
