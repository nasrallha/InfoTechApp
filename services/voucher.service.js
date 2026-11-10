import "server-only";
import { partyInBranch } from "@/lib/party-scope";
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

export const VOUCHER_TYPES = ["receipt", "payment", "settlement", "offset"];
// صلاحية كل نوع
export const VOUCHER_PERM = {
  receipt: "receipts",
  payment: "paymentVouchers",
  settlement: "settlements",
  offset: "offsets",
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

// ------------------------------------------------------------
// تجهيز السند (الإضافة والتعديل): الطرف، طريقة الدفع، التاريخ، الوردية
// existing: السند الحالي في التعديل (تاريخه ووردية درجه)
// ------------------------------------------------------------
async function prepareVoucher(data, user, existing = null) {
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
  let partyId = null;
  if (partyType === "customer" || partyType === "supplier") {
    partyKind = partyType;
    partyId = partyType === "customer" ? data.customerId : data.supplierId;
    if (!partyId)
      throw new AppError("RequiredField", null, { partyId: "RequiredField" });
    const row = await prisma[partyType].findFirst({
      // الطرف لازم يكون متاح في فرع السند
      where: { id: partyId, ...partyInBranch(user.branch.id) },
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

  // ---------- التاريخ: الآن (أو تاريخ السند في التعديل)، أو يوم سابق بالصلاحية ----------
  const now = today();
  const keep = existing ? dayOf(existing.date) : now;
  const day =
    data.date && can(user, `${VOUCHER_PERM[type]}.changeDate`)
      ? data.date
      : keep;
  if (day > now) throw new AppError("FutureDate", null, { date: "FutureDate" });
  const date = existing
    ? day === keep
      ? existing.date
      : dayToDateTime(day)
    : day === now
      ? new Date()
      : dayToDateTime(day);

  // ---------- الوردية: النقدي من كاشير عنده وردية مفتوحة على نفس الفرع ----------
  // (التعديل: لو السند كان على وردية ولسه نقدي، بيفضل عليها)
  let shiftId = null;
  if (method?.type === "cash") {
    if (existing?.shiftId) shiftId = existing.shiftId;
    else {
      const shift = await prisma.shift.findFirst({
        where: { userId: user.id, status: "open", branchId: user.branch.id },
        select: { id: true },
      });
      shiftId = shift?.id ?? null;
    }
  }

  return {
    type,
    partyType,
    amount,
    decimals,
    party,
    partyKind,
    partyId,
    method,
    date,
    shiftId,
  };
}

// المبلغ لا يتجاوز الرصيد (داخل العملية)، والقبض من عميل مسموح بزيادة (دفعة مقدمة)
async function assertWithinBalance(tx, v) {
  if (!v.partyKind) return;
  // نقفل صف الطرف حتى نهاية العملية (سندين في نفس اللحظة لا يتجاوزان الرصيد)
  await tx[v.partyKind].update({
    where: { id: v.partyId },
    data: { updatedAt: new Date() },
  });
  const balance = await partyBalance(v.partyKind, v.partyId, { db: tx });
  if (v.type !== "receipt" && v.amount > balance + EPS) {
    throw new AppError(
      "AmountExceedsBalance",
      { balance: round(balance, v.decimals) },
      { amount: "AmountExceedsBalance" },
    );
  }
}

// توزيع السند على الأقدم (الافتتاحي ثم الفواتير)
async function allocate(tx, voucherId, v) {
  if (!v.partyKind) return;
  const rows = await allocateFifo(v.partyKind, v.partyId, v.amount, tx);
  const docKey = v.partyKind === "customer" ? "saleId" : "purchaseId";
  const docModel = v.partyKind === "customer" ? "sale" : "purchase";
  for (const r of rows) {
    await tx.voucherAllocation.create({
      data: { voucherId, [docKey]: r.docId, amount: r.amount },
    });
    if (r.docId) {
      await tx[docModel].update({
        where: { id: r.docId },
        data: { settledAmount: { increment: r.amount } },
      });
    }
  }
}

// إلغاء توزيع السند (المسدد على الفواتير يرجع)
async function unallocate(tx, voucherId) {
  const rows = await tx.voucherAllocation.findMany({
    where: { voucherId },
    select: { saleId: true, purchaseId: true, amount: true },
  });
  for (const a of rows) {
    if (a.saleId)
      await tx.sale.update({
        where: { id: a.saleId },
        data: { settledAmount: { decrement: a.amount } },
      });
    if (a.purchaseId)
      await tx.purchase.update({
        where: { id: a.purchaseId },
        data: { settledAmount: { decrement: a.amount } },
      });
  }
  await tx.voucherAllocation.deleteMany({ where: { voucherId } });
}

const voucherRow = (v, data) => ({
  partyType: v.partyType,
  shiftId: v.shiftId,
  customerId: v.partyType === "customer" ? data.customerId : null,
  supplierId: v.partyType === "supplier" ? data.supplierId : null,
  expenseCategoryId: v.partyType === "expense" ? data.expenseCategoryId : null,
  partyArName: v.party.arName,
  partyEnName: v.party.enName,
  paymentMethodId: v.method?.id ?? null,
  amount: v.amount,
  reference: data.reference ?? null,
  date: v.date,
  notes: data.notes ?? null,
});

async function createVoucherNow(data, user) {
  const v = await prepareVoucher(data, user);
  return runTx(async (tx) => {
    await assertWithinBalance(tx, v);
    const number = await nextNumber(tx, v.type);
    const created = await tx.voucher.create({
      data: {
        type: v.type,
        number,
        branchId: user.branch.id,
        ...voucherRow(v, data),
        createdById: user.id,
        requestId: data.requestId ?? null,
      },
      select: { id: true, number: true },
    });
    await allocate(tx, created.id, v);
    return created;
  }, TX_OPTIONS);
}

// ------------------------------------------------------------
// تعديل سند (بصلاحية "تعديل" لنوعه): نفس النوع والرقم
// - التوزيع القديم على الفواتير بيرجع، والمبلغ الجديد يتوزع من الأقدم تاني
// - ممنوع لو ورديته اتقفلت، أو لو السند مربوط باشتراك مغسلة
// ------------------------------------------------------------
export async function updateVoucher({ id, ...data }, user) {
  const existing = await prisma.voucher.findFirst({
    where: { id, ...branchScope(user) },
    select: {
      id: true,
      type: true,
      date: true,
      shiftId: true,
      shift: { select: { status: true } },
      laundryWallet: { select: { id: true } },
    },
  });
  if (!existing) throw new AppError("VoucherNotFound");
  if (!can(user, `${VOUCHER_PERM[existing.type]}.update`))
    throw new AppError("Forbidden");
  if (existing.shift && existing.shift.status !== "open")
    throw new AppError("VoucherShiftClosed");
  if (existing.laundryWallet) throw new AppError("VoucherLinkedLaundry");

  // النوع مبيتغيرش في التعديل
  const v = await prepareVoucher(
    { ...data, type: existing.type },
    user,
    existing,
  );
  return runTx(async (tx) => {
    await unallocate(tx, id);
    // الرصيد من غير السند ده: نصفّر مبلغه مؤقتاً قبل الفحص
    await tx.voucher.update({ where: { id }, data: { amount: 0 } });
    await assertWithinBalance(tx, v);
    const updated = await tx.voucher.update({
      where: { id },
      data: voucherRow(v, data),
      select: { id: true, number: true, type: true },
    });
    await allocate(tx, id, v);
    return updated;
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
      // للتعديل
      expenseCategoryId: true,
      paymentMethodId: true,
      laundryWallet: { select: { id: true } },
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
          // النوع: فاتورة أو إشعار مدين (السند ممكن يسدد الاتنين)
          sale: { select: { id: true, type: true, number: true } },
          purchase: { select: { id: true, type: true, number: true } },
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
// الأطراف المتاحة في فرع المستخدم (فرع السند)
export async function getVoucherOptions(user) {
  const inBranch = user?.branch?.id ? partyInBranch(user.branch.id) : {};
  const [customers, suppliers, categories, methods] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true, ...inBranch },
      orderBy: { code: "asc" },
      select: { id: true, code: true, arName: true, enName: true, phone: true },
    }),
    prisma.supplier.findMany({
      where: { isActive: true, ...inBranch },
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

// ============================================================
// سند مقاصة (عميل هو مورد): بيقفل جزء من رصيد العميل في رصيد المورد
// - مفيش فلوس بتتحرك، والمبلغ ميعدّيش رصيد العميل (عليه) ولا رصيد المورد (له)
// - بيتوزع على أقدم فواتير العميل وأقدم فواتير المورد
// ============================================================
export async function createOffset(data, user) {
  const currency = await getBaseCurrency();
  const decimals = currency.decimals ?? 2;
  const amount = round(data.amount, decimals);
  if (!(amount > 0)) throw new AppError("MustBePositive");
  const [customer, supplier] = await Promise.all([
    prisma.customer.findFirst({
      where: { id: data.customerId, ...partyInBranch(user.branch.id) },
      select: { arName: true, enName: true },
    }),
    prisma.supplier.findFirst({
      where: { id: data.supplierId, ...partyInBranch(user.branch.id) },
      select: { arName: true, enName: true },
    }),
  ]);
  if (!customer || !supplier) throw new AppError("PartyNotFound");

  const now = today();
  const day = data.date && can(user, "offsets.changeDate") ? data.date : now;
  if (day > now) throw new AppError("FutureDate", null, { date: "FutureDate" });
  const date = day === now ? new Date() : dayToDateTime(day);

  return saveOnce(
    "voucher",
    data.requestId,
    user,
    { id: true, number: true },
    () =>
      runTx(async (tx) => {
        // نقفل الطرفين، والمبلغ ميعدّيش أي رصيد منهم
        await tx.customer.update({
          where: { id: data.customerId },
          data: { updatedAt: new Date() },
        });
        await tx.supplier.update({
          where: { id: data.supplierId },
          data: { updatedAt: new Date() },
        });
        const [cb, sb] = await Promise.all([
          partyBalance("customer", data.customerId, { db: tx }),
          partyBalance("supplier", data.supplierId, { db: tx }),
        ]);
        const max = Math.min(cb, sb);
        if (amount > max + EPS)
          throw new AppError(
            "OffsetExceedsBalance",
            { balance: round(Math.max(max, 0), decimals) },
            { amount: "OffsetExceedsBalance" },
          );

        const number = await nextNumber(tx, "offset");
        const created = await tx.voucher.create({
          data: {
            type: "offset",
            number,
            partyType: "offset",
            branchId: user.branch.id,
            customerId: data.customerId,
            supplierId: data.supplierId,
            partyArName: `${customer.arName} / ${supplier.arName}`,
            partyEnName: `${customer.enName} / ${supplier.enName}`,
            amount,
            date,
            notes: data.notes ?? null,
            createdById: user.id,
            requestId: data.requestId ?? null,
          },
          select: { id: true, number: true },
        });
        // التوزيع على الطرفين (كل طرف بعلامته)
        for (const [kind, partyId, docKey, docModel] of [
          ["customer", data.customerId, "saleId", "sale"],
          ["supplier", data.supplierId, "purchaseId", "purchase"],
        ]) {
          const rows = await allocateFifo(kind, partyId, amount, tx);
          for (const r of rows) {
            await tx.voucherAllocation.create({
              data: {
                voucherId: created.id,
                [docKey]: r.docId,
                amount: r.amount,
                partySide: kind,
              },
            });
            if (r.docId)
              await tx[docModel].update({
                where: { id: r.docId },
                data: { settledAmount: { increment: r.amount } },
              });
          }
        }
        return created;
      }, TX_OPTIONS),
  );
}
