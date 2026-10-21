"use server";

// البوابة بين شاشات الحسابات (السندات، بنود المصروفات، كشوف الحساب) والسيرفر

import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { dayStart, dayEnd } from "@/lib/dates";
import { idField } from "@/validations/common.schema";
import {
  createVoucherSchema,
  expenseCategorySchema,
  partyAccountSchema,
  statementSchema,
} from "@/validations/account.schema";
import {
  createVoucher,
  deleteVoucher,
  getVoucher,
  deleteExpenseCategory,
  saveExpenseCategory,
  VOUCHER_PERM,
} from "@/services/voucher.service";
import { getPartyAccount, getStatement } from "@/services/account.service";

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
          can(user, "settlements.create") ||
          can(user, STATEMENT_PERM.customer)
        : can(user, "paymentVouchers.create") ||
          can(user, "settlements.create") ||
          can(user, STATEMENT_PERM.supplier);
    if (!allowed) throw new AppError("Forbidden");
    return getPartyAccount(d.kind, d.id);
  });
}

// كشف حساب عميل/مورد لفترة
export async function getStatementAction(input) {
  return runAction(statementSchema, input, async (d, user) => {
    if (!can(user, STATEMENT_PERM[d.kind])) throw new AppError("Forbidden");
    const res = await getStatement(d.kind, d.id, {
      from: d.from ? dayStart(d.from) : undefined,
      to: d.to ? dayEnd(d.to) : undefined,
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
