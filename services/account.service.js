import "server-only";
import { prisma } from "@/lib/prisma";
import { round } from "@/lib/invoice-calc";
import { saleDocNo, formatDocNo } from "@/lib/doc-number";

// ============================================================
// أرصدة العملاء والموردين، والفواتير المفتوحة، وكشف الحساب
//
// العميل (موجب = عليه لنا):
//   الرصيد = الافتتاحي + آجل فواتير البيع - المرتجع لحسابه - سندات القبض والتسوية
// المورد (موجب = له علينا):
//   الرصيد = الافتتاحي + آجل فواتير الشراء - المرتجع لحسابنا - سندات الصرف والتسوية
//
// المفتوح في كل فاتورة = آجلها - المسدد عليها بسندات - مرتجعاتها لحساب الطرف
// السند يسدد من الأقدم: الرصيد الافتتاحي أولاً ثم الفواتير بالتاريخ
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const EPS = 0.0001;

const PARTY = {
  customer: {
    model: "customer",
    doc: "sale",
    docModel: "sale",
    docType: "sale",
    returnType: "return",
    key: "customerId",
    allocKey: "saleId",
    voucherTypes: ["receipt", "settlement"],
  },
  supplier: {
    model: "supplier",
    doc: "purchase",
    docModel: "purchase",
    docType: "purchase",
    returnType: "return",
    key: "supplierId",
    allocKey: "purchaseId",
    voucherTypes: ["payment", "settlement"],
  },
};

// رصيد طرف (عميل أو مورد) حالياً، أو قبل تاريخ معيّن (before)
export async function partyBalance(kind, id, { before, db = prisma } = {}) {
  const P = PARTY[kind];
  const party = await db[P.model].findUnique({
    where: { id },
    select: { openingBalance: true },
  });
  if (!party) return 0;
  const dateFilter = before ? { date: { lt: before } } : {};
  const [docs, returns, vouchers] = await Promise.all([
    db[P.docModel].aggregate({
      where: { [P.key]: id, type: P.docType, ...dateFilter },
      _sum: { remainingAmount: true },
    }),
    db[P.docModel].aggregate({
      where: { [P.key]: id, type: P.returnType, ...dateFilter },
      _sum: { remainingAmount: true },
    }),
    db.voucher.aggregate({
      where: { [P.key]: id, type: { in: P.voucherTypes }, ...dateFilter },
      _sum: { amount: true },
    }),
  ]);
  return round(
    n(party.openingBalance) +
      n(docs._sum.remainingAmount) -
      n(returns._sum.remainingAmount) -
      n(vouchers._sum.amount),
    4,
  );
}

// الفواتير المفتوحة (من الأقدم) + المفتوح من الرصيد الافتتاحي
export async function openItems(kind, id, db = prisma) {
  const P = PARTY[kind];
  const party = await db[P.model].findUnique({
    where: { id },
    select: { openingBalance: true },
  });
  if (!party) return { opening: 0, invoices: [] };

  const [docs, openingAlloc] = await Promise.all([
    db[P.docModel].findMany({
      where: { [P.key]: id, type: P.docType, remainingAmount: { gt: 0 } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: {
        id: true,
        number: true,
        date: true,
        totalAmount: true,
        remainingAmount: true,
        settledAmount: true,
        returns: { select: { remainingAmount: true } },
      },
    }),
    db.voucherAllocation.aggregate({
      where: {
        [P.allocKey]: null,
        voucher: { [P.key]: id, type: { in: P.voucherTypes } },
      },
      _sum: { amount: true },
    }),
  ]);

  const invoices = docs
    .map((d) => {
      const returned = d.returns.reduce((s, r) => s + n(r.remainingAmount), 0);
      return {
        id: d.id,
        number: d.number,
        docNo:
          kind === "customer"
            ? saleDocNo("sale", d.number)
            : formatDocNo("purchase", d.number),
        date: d.date,
        total: n(d.totalAmount),
        credit: n(d.remainingAmount),
        settled: n(d.settledAmount),
        returned: round(returned, 4),
        open: round(n(d.remainingAmount) - n(d.settledAmount) - returned, 4),
      };
    })
    .filter((d) => d.open > EPS);

  return {
    opening: round(n(party.openingBalance) - n(openingAlloc._sum.amount), 4),
    invoices,
  };
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
export async function getPartyAccount(kind, id) {
  const [balance, items] = await Promise.all([
    partyBalance(kind, id),
    openItems(kind, id),
  ]);
  return { balance, ...items };
}

// ============================================================
// كشف الحساب: رصيد أول المدة ثم كل حركة بالرصيد بعدها
// from / to: Date (to = نهاية اليوم)
// ============================================================
export async function getStatement(kind, id, { from, to }) {
  const P = PARTY[kind];
  const party = await prisma[P.model].findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      arName: true,
      enName: true,
      phone: true,
      taxNo: true,
      openingBalance: true,
    },
  });
  if (!party) return null;

  const range = {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
  const opening = from
    ? await partyBalance(kind, id, { before: from })
    : n(party.openingBalance);

  const [docs, vouchers] = await Promise.all([
    prisma[P.docModel].findMany({
      where: { [P.key]: id, date: range },
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
      },
    }),
    prisma.voucher.findMany({
      where: { [P.key]: id, type: { in: P.voucherTypes }, date: range },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: {
        id: true,
        type: true,
        number: true,
        date: true,
        amount: true,
        notes: true,
        paymentMethod: { select: { arName: true, enName: true } },
      },
    }),
  ]);

  const isSale = kind === "customer";
  const lines = [
    ...docs.map((d) => {
      const isReturn = d.type === "return";
      const docNo = isSale
        ? saleDocNo(d.type, d.number)
        : formatDocNo(isReturn ? "return" : "purchase", d.number);
      const href = isSale
        ? `/invoices/${isReturn ? "sales-returns" : "sales"}/${d.id}`
        : `/invoices/${isReturn ? "purchase-returns" : "purchases"}/${d.id}`;
      // الفاتورة: مدين بالإجمالي ودائن بالمدفوع وقتها
      // المرتجع: دائن بالإجمالي ومدين بالمردود نقداً
      return {
        key: `d${d.id}`,
        date: d.date,
        kind: isReturn ? "return" : "invoice",
        docNo,
        href,
        debit: isReturn ? n(d.paidAmount) : n(d.totalAmount),
        credit: isReturn ? n(d.totalAmount) : n(d.paidAmount),
        notes: d.notes,
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
  return {
    party: { ...party, openingBalance: n(party.openingBalance) },
    opening,
    lines,
    totalDebit: round(totalDebit, 4),
    totalCredit: round(totalCredit, 4),
    closing: balance,
  };
}

// قائمة العملاء أو الموردين لشاشة كشف الحساب
export async function getStatementParties(kind) {
  return prisma[PARTY[kind].model].findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, arName: true, enName: true, phone: true },
  });
}
