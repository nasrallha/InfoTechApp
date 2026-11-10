"use server";

// البوابة بين شاشات الحسابات (السندات، بنود المصروفات، كشوف الحساب) والسيرفر

import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { dayStart, dayEnd } from "@/lib/dates";
import { statementBranch } from "@/lib/party-scope";
import { idField } from "@/validations/common.schema";
import {
  createVoucherSchema,
  expenseCategorySchema,
  partyAccountSchema,
  statementSchema,
  updateVoucherSchema,
  linkPartiesSchema,
  createOffsetSchema,
} from "@/validations/account.schema";
import {
  createVoucher,
  createOffset,
  deleteVoucher,
  updateVoucher,
  getVoucher,
  deleteExpenseCategory,
  saveExpenseCategory,
  VOUCHER_PERM,
} from "@/services/voucher.service";
import {
  getPartyAccount,
  getStatement,
  linkCustomerSupplier,
} from "@/services/account.service";

const STATEMENT_PERM = {
  customer: "statements.customers",
  supplier: "statements.suppliers",
};

// سند جديد (الصلاحية حسب النوع: receipts / paymentVouchers / settlements)
export async function createVoucherAction(input) {
  return runAction(
    createVoucherSchema,
    input,
    async (d, user) => {
      if (!can(user, `${VOUCHER_PERM[d.type]}.create`)) {
        throw new AppError("Forbidden");
      }
      // نرجّع السند كامل حتى يُطبع في نفس الشاشة بعد الحفظ
      const created = await createVoucher(d, user);
      return getVoucher(created.id, user);
    },
    { refresh: true },
  );
}

// تعديل سند (الصلاحية تُفحص في الـ service حسب نوع السند)
export async function updateVoucherAction(input) {
  return runAction(
    updateVoucherSchema,
    input,
    async (d, user) => {
      const updated = await updateVoucher(d, user);
      return getVoucher(updated.id, user);
    },
    { refresh: true },
  );
}

// حذف سند (الصلاحية تُفحص في الـ service حسب نوع السند)
export async function deleteVoucherAction(id) {
  return runAction(idField, id, (d, user) => deleteVoucher(d, user), {
    refresh: true,
  });
}

// رصيد العميل/المورد والفواتير المفتوحة (لشاشة السند)
export async function getPartyAccountAction(input) {
  return runAction(partyAccountSchema, input, (d, user) => {
    const allowed =
      d.kind === "customer"
        ? can(user, "receipts.create") ||
          can(user, "receipts.update") ||
          can(user, "settlements.create") ||
          can(user, "settlements.update") ||
          can(user, STATEMENT_PERM.customer)
        : can(user, "paymentVouchers.create") ||
          can(user, "paymentVouchers.update") ||
          can(user, "settlements.create") ||
          can(user, "settlements.update") ||
          can(user, STATEMENT_PERM.supplier);
    if (!allowed) throw new AppError("Forbidden");
    return getPartyAccount(d.kind, d.id, {
      excludeVoucherId: d.excludeVoucherId ?? null,
    });
  });
}

// كشف حساب عميل/مورد لفترة
export async function getStatementAction(input) {
  return runAction(statementSchema, input, async (d, user) => {
    if (!can(user, STATEMENT_PERM[d.kind])) throw new AppError("Forbidden");
    const res = await getStatement(d.kind, d.id, {
      from: d.from ? dayStart(d.from) : undefined,
      to: d.to ? dayEnd(d.to) : undefined,
      // موظف الفرع: حركات فرعه بس
      branchId: statementBranch(user),
      user,
    });
    if (!res) throw new AppError("PartyNotFound");
    return res;
  });
}

// ------------------------------------------------------------
// بنود المصروفات
// ------------------------------------------------------------
export async function saveExpenseCategoryAction(input) {
  return runAction(
    expenseCategorySchema,
    input,
    (d, user) => {
      if (
        !can(
          user,
          d.id ? "expenseCategories.update" : "expenseCategories.create",
        )
      ) {
        throw new AppError("Forbidden");
      }
      return saveExpenseCategory(d);
    },
    { refresh: true },
  );
}

export async function deleteExpenseCategoryAction(id) {
  return runAction(idField, id, (d) => deleteExpenseCategory(d), {
    permission: "expenseCategories.delete",
    refresh: true,
  });
}

// ربط عميل بمورد (الكشف المشترك)
export async function linkPartiesAction(input) {
  return runAction(
    linkPartiesSchema,
    input,
    (d) => linkCustomerSupplier(d.customerId, d.supplierId ?? null),
    { permission: "statements.combined" },
  );
}

// سند مقاصة (من الكشف المشترك)
export async function createOffsetAction(input) {
  return runAction(
    createOffsetSchema,
    input,
    (d, user) => createOffset(d, user),
    { permission: "offsets.create", refresh: true },
  );
}
