import "server-only";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/transaction";
import { saveOnce } from "@/lib/idempotency";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { round } from "@/lib/invoice-calc";
import { dayOf, dayToDateTime, today } from "@/lib/dates";
import { parseDocNo } from "@/lib/doc-number";
import { allocateFifo, partyBalance } from "./account.service";
import { getBaseCurrency } from "./currency.service";

// ============================================================
// السندات
// - قبض (receipt): من عميل (يسدد من أقدم فاتورة) أو إيراد متنوع
// - صرف (payment): لمورد (يسدد من أقدم فاتورة) أو مصروف (بند مصروفات)
// - تسوية (settlement): خصم مسموح به لعميل / خصم مكتسب من مورد
//   (لا فلوس تتحرك، فقط الرصيد يقل، ويظهر في الأرباح)
// - المبلغ لا يتجاوز رصيد المورد (الصرف) أو الطرف (التسوية)
//   أما القبض من عميل فمسموح بأكثر من مديونيته: الزيادة رصيد دائن له (دفعة مقدمة)
// - السند النقدي من كاشير عنده وردية مفتوحة: يدخل/يخرج من درجه
// ============================================================

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };
const EPS = 0.0001;
const n = (v) => (v == null ? 0 : Number(v));

export const VOUCHER_TYPES = ["receipt", "payment", "settlement"];
// صلاحية كل نوع
export const VOUCHER_PERM = {
  receipt: "receipts",
  payment: "paymentVouchers",
  settlement: "settlements",
};
// الأطراف المسموحة لكل نوع
const PARTIES = {
  receipt: ["customer", "other"],
  payment: ["supplier", "expense"],
  settlement: ["customer", "supplier"],
};

const branchScope = (user) =>
  can(user, "allBranches.view") ? {} : { branchId: user.branch.id };

async function nextNumber(tx, type) {
  const seq = await tx.documentSequence.upsert({
    where: { key: type },
    create: { key: type, last: 1 },
    update: { last: { increment: 1 } },
    select: { last: true },
  });
  return seq.last;
}

// ------------------------------------------------------------
// سند جديد
// data: { type, partyType, customerId?, supplierId?, expenseCategoryId?,
//         partyName?, paymentMethodId?, amount, reference?, date?, notes? }
// ------------------------------------------------------------
// بصمة الحفظ: نفس requestId مرتين ← نفس المستند (lib/idempotency)
export function createVoucher(data, user) {
  return saveOnce(
    "voucher",
    data.requestId,
    user,
    { id: true, number: true },
    () => createVoucherNow(data, user),
  );
}

async function createVoucherNow(data, user) {
  const { type, partyType } = data;
  if (!PARTIES[type]?.includes(partyType))
    throw new AppError("ValidationError");
  const currency = await getBaseCurrency();
  const decimals = currency.decimals ?? 2;
  const amount = round(data.amount, decimals);
  if (!(amount > 0)) throw new AppError("MustBePositive");

  // ---------- الطرف ----------
  let party = { arName: null, enName: null };
  let partyKind = null;
  if (partyType === "customer" || partyType === "supplier") {
    partyKind = partyType;
    const id = partyType === "customer" ? data.customerId : data.supplierId;
    if (!id)
      throw new AppError("RequiredField", null, { partyId: "RequiredField" });
    const row = await prisma[partyType].findUnique({
      where: { id },
      select: { arName: true, enName: true },
    });
    if (!row) throw new AppError("PartyNotFound");
    party = row;
  } else if (partyType === "expense") {
    const cat = await prisma.expenseCategory.findFirst({
      where: { id: data.expenseCategoryId ?? -1, isActive: true },
      select: { arName: true, enName: true },
    });
    if (!cat) {
      throw new AppError("ExpenseCategoryNotFound", null, {
        expenseCategoryId: "ExpenseCategoryNotFound",
      });
    }
    party = cat;
  } else {
    const name = data.partyName?.trim();
    if (!name)
      throw new AppError("RequiredField", null, { partyName: "RequiredField" });
    party = { arName: name, enName: name };
  }

  // ---------- طريقة الدفع (التسوية بدون) ----------
  let method = null;
  if (type !== "settlement") {
    method = await prisma.paymentMethod.findFirst({
      where: { id: data.paymentMethodId ?? -1, isActive: true },
      select: { id: true, type: true, requiresReference: true },
    });
    if (!method || method.type === "credit") {
      throw new AppError("PaymentMethodNotFound", null, {
        paymentMethodId: "PaymentMethodNotFound",
      });
    }
    if (method.requiresReference && !data.reference) {
      throw new AppError("ReferenceRequired", null, {
        reference: "ReferenceRequired",
      });
    }
  }

  // ---------- التاريخ: الآن، أو يوم سابق بصلاحية "تغيير التاريخ" ----------
  const now = today();
  const day =
    data.date && can(user, `${VOUCHER_PERM[type]}.changeDate`)
      ? data.date
      : now;
  if (day > now) throw new AppError("FutureDate", null, { date: "FutureDate" });
  const date = day === now ? new Date() : dayToDateTime(day);

  // ---------- الوردية: النقدي من كاشير عنده وردية مفتوحة على نفس الفرع ----------
  let shiftId = null;
  if (method?.type === "cash") {
    const shift = await prisma.shift.findFirst({
      where: { userId: user.id, status: "open", branchId: user.branch.id },
      select: { id: true },
    });
    shiftId = shift?.id ?? null;
  }

  return runTx(async (tx) => {
    // المبلغ لا يتجاوز الرصيد (داخل العملية حتى لا يسبق سند آخر في نفس اللحظة)
    if (partyKind) {
      const id = partyKind === "customer" ? data.customerId : data.supplierId;
      // نقفل صف الطرف حتى نهاية العملية (سندين في نفس اللحظة لا يتجاوزان الرصيد)
      await tx[partyKind].update({
        where: { id },
        data: { updatedAt: new Date() },
      });
      const balance = await partyBalance(partyKind, id, { db: tx });
      // سند القبض من عميل مسموح يزيد عن مديونيته (دفعة مقدمة): الزيادة تبقى رصيد له
      // الصرف للمورد والتسوية: لا يتجاوزان الرصيد
      if (type !== "receipt" && amount > balance + EPS) {
        throw new AppError(
          "AmountExceedsBalance",
          { balance: round(balance, decimals) },
          {
            amount: "AmountExceedsBalance",
          },
        );
      }
    }

    const number = await nextNumber(tx, type);
    const created = await tx.voucher.create({
      data: {
        type,
        number,
        partyType,
        branchId: user.branch.id,
        shiftId,
        customerId: partyType === "customer" ? data.customerId : null,
        supplierId: partyType === "supplier" ? data.supplierId : null,
        expenseCategoryId:
          partyType === "expense" ? data.expenseCategoryId : null,
        partyArName: party.arName,
        partyEnName: party.enName,
        paymentMethodId: method?.id ?? null,
        amount,
        reference: data.reference ?? null,
        date,
        notes: data.notes ?? null,
        createdById: user.id,
        requestId: data.requestId ?? null,
      },
      select: { id: true, number: true },
    });

    // التوزيع على الأقدم
    if (partyKind) {
      const id = partyKind === "customer" ? data.customerId : data.supplierId;
      const rows = await allocateFifo(partyKind, id, amount, tx);
      const docKey = partyKind === "customer" ? "saleId" : "purchaseId";
      const docModel = partyKind === "customer" ? "sale" : "purchase";
      for (const r of rows) {
        await tx.voucherAllocation.create({
          data: { voucherId: created.id, [docKey]: r.docId, amount: r.amount },
        });
        if (r.docId) {
          await tx[docModel].update({
            where: { id: r.docId },
            data: { settledAmount: { increment: r.amount } },
          });
        }
      }
    }
    return created;
  }, TX_OPTIONS);
}

// حذف سند: يرجع المسدد على الفواتير (ممنوع لو ورديته اتقفلت)
export async function deleteVoucher(id, user) {
  return runTx(async (tx) => {
    const v = await tx.voucher.findFirst({
      where: { id, ...branchScope(user) },
      select: {
        id: true,
        type: true,
        shift: { select: { status: true } },
        allocations: {
          select: { saleId: true, purchaseId: true, amount: true },
        },
      },
    });
    if (!v) throw new AppError("VoucherNotFound");
    if (!can(user, `${VOUCHER_PERM[v.type]}.delete`))
      throw new AppError("Forbidden");
    if (v.shift && v.shift.status !== "open")
      throw new AppError("VoucherShiftClosed");
    for (const a of v.allocations) {
      if (a.saleId) {
        await tx.sale.update({
          where: { id: a.saleId },
          data: { settledAmount: { decrement: a.amount } },
        });
      }
      if (a.purchaseId) {
        await tx.purchase.update({
          where: { id: a.purchaseId },
          data: { settledAmount: { decrement: a.amount } },
        });
      }
    }
    await tx.voucher.delete({ where: { id } });
    return { deleted: 1, type: v.type };
  }, TX_OPTIONS);
}

const listSelect = {
  id: true,
  type: true,
  number: true,
  partyType: true,
  partyArName: true,
  partyEnName: true,
  amount: true,
  date: true,
  reference: true,
  notes: true,
  paymentMethod: { select: { arName: true, enName: true, type: true } },
  branch: { select: { arName: true, enName: true } },
  createdBy: { select: { arFullname: true, enFullname: true } },
};

export async function listVouchers({
  type,
  q = "",
  page = 1,
  pageSize = 20,
  user,
}) {
  const query = q.trim();
  const num = parseDocNo(query);
  const where = {
    type,
    ...branchScope(user),
    ...(query
      ? {
          OR: [
            ...(num ? [{ number: num }] : []),
            { partyArName: { contains: query } },
            { partyEnName: { contains: query } },
            { reference: { contains: query } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.voucher.count({ where }),
    prisma.voucher.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: listSelect,
    }),
  ]);
  return { total, page, pageSize, rows };
}

export async function getVoucher(id, user) {
  const v = await prisma.voucher.findFirst({
    where: { id, ...branchScope(user) },
    select: {
      ...listSelect,
      customerId: true,
      supplierId: true,
      expenseCategory: { select: { arName: true, enName: true } },
      shift: { select: { id: true, number: true, status: true } },
      branch: {
        select: {
          id: true,
          arName: true,
          enName: true,
          phone: true,
          registrationNo: true,
          city: true,
          district: true,
          street: true,
          buildingNo: true,
          additionalNo: true,
          postalCode: true,
        },
      },
      allocations: {
        select: {
          id: true,
          amount: true,
          sale: { select: { id: true, number: true } },
          purchase: { select: { id: true, number: true } },
        },
      },
    },
  });
  if (!v) return null;
  // رصيد العميل/المورد بعد السند (كل الحركات حتى لحظة السند)
  let balanceAfter = null;
  if (v.customerId || v.supplierId) {
    balanceAfter = await partyBalance(
      v.customerId ? "customer" : "supplier",
      v.customerId ?? v.supplierId,
      { before: new Date(new Date(v.date).getTime() + 1) },
    );
  }
  return { ...v, balanceAfter, dayOfDate: dayOf(v.date) };
}

// ------------------------------------------------------------
// بنود المصروفات
// ------------------------------------------------------------
export async function getExpenseCategories({ activeOnly = false } = {}) {
  return prisma.expenseCategory.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: { id: "asc" },
    select: {
      id: true,
      arName: true,
      enName: true,
      isActive: true,
      _count: { select: { vouchers: true } },
    },
  });
}

function uniqueError(error) {
  if (error?.code === "P2002") throw new AppError("NameExists");
  throw error;
}

export async function saveExpenseCategory({ id, ...data }) {
  try {
    return id
      ? await prisma.expenseCategory.update({
          where: { id },
          data,
          select: { id: true },
        })
      : await prisma.expenseCategory.create({ data, select: { id: true } });
  } catch (e) {
    uniqueError(e);
  }
}

export async function deleteExpenseCategory(id) {
  const used = await prisma.voucher.count({ where: { expenseCategoryId: id } });
  if (used) throw new AppError("ExpenseCategoryInUse");
  await prisma.expenseCategory.delete({ where: { id } });
  return { deleted: 1 };
}

// الأطراف لشاشة السند
export async function getVoucherOptions() {
  const [customers, suppliers, categories, methods] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, arName: true, enName: true, phone: true },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, arName: true, enName: true, phone: true },
    }),
    getExpenseCategories({ activeOnly: true }),
    prisma.paymentMethod.findMany({
      where: { isActive: true, type: { not: "credit" } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        arName: true,
        enName: true,
        type: true,
        requiresReference: true,
      },
    }),
  ]);
  return { customers, suppliers, categories, methods };
}

export { n as toNumber };
