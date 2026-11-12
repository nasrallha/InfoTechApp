"use server";

// عقود الإيجار: الإضافة (rentContracts.create) والتعديل (rentContracts.update)
// والخروج المبكر (rentContracts.terminate)

import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { contractSchema, terminateSchema } from "@/validations/real-estate.schema";
import { deleteContract, saveContract, terminateContract } from "@/services/rent-contract.service";
import {
  cancelInstallmentInvoice,
  issueInstallmentInvoice,
  previewInstallment,
  updateInstallmentInvoice,
} from "@/services/rent-invoice.service";
import { z } from "zod";
import { idField, optionalText } from "@/validations/common.schema";

export async function saveContractAction(input) {
  return runAction(
    contractSchema,
    input,
    (d, user) => {
      if (!can(user, d.id ? "rentContracts.update" : "rentContracts.create"))
        throw new AppError("Forbidden");
      return saveContract(d, user);
    },
    { refresh: true },
  );
}

export async function terminateContractAction(input) {
  return runAction(terminateSchema, input, (d, user) => terminateContract(d, user), {
    permission: "rentContracts.terminate",
    refresh: true,
  });
}

// فاتورة دفعة (فاتورة بيع على المستأجر بفترة السداد) - rentContracts.invoice
// payment: طريقة الدفع (مدفوعة بالكامل على الفاتورة) أو فاضي = آجل على المستأجر
// paidAmount: المدفوع دلوقتي شامل الضريبة (فاضي = كامل) | remainder: الباقي آجل / يترحل
const invoiceSchema = z.object({
  id: idField,
  paymentMethodId: idField.nullish(),
  reference: optionalText(100),
  paidAmount: z.number().min(0, "MustBePositive").nullish(),
  remainder: z.enum(["credit", "carry"]).default("credit"),
});

export async function issueInstallmentInvoiceAction(input) {
  return runAction(
    invoiceSchema,
    input,
    (d, user) =>
      issueInstallmentInvoice(d.id, user, {
        paymentMethodId: d.paymentMethodId ?? null,
        reference: d.reference,
        paidAmount: d.paidAmount ?? null,
        remainder: d.remainder,
      }),
    { permission: "rentContracts.invoice", refresh: true },
  );
}

// تعديل فاتورة الدفعة: القيمة + السداد (بنفس رقمها) - rentContracts.editInvoice
const editInvoiceSchema = invoiceSchema.extend({
  amount: z.number().positive("MustBePositive"),
});

export async function updateInstallmentInvoiceAction(input) {
  return runAction(
    editInvoiceSchema,
    input,
    (d, user) =>
      updateInstallmentInvoice(d.id, user, d.amount, {
        paymentMethodId: d.paymentMethodId ?? null,
        reference: d.reference,
        paidAmount: d.paidAmount ?? null,
        remainder: d.remainder,
      }),
    { permission: "rentContracts.editInvoice", refresh: true },
  );
}

// معاينة فاتورة الدفعة: الإجمالي شامل الضريبة + هل فيه دفعة جاية
// amount: القيمة الجديدة في نافذة التعديل
const previewSchema = z.object({
  id: idField,
  amount: z.number().positive("MustBePositive").nullish(),
});

export async function previewInstallmentAction(input) {
  return runAction(previewSchema, input, (d, user) => {
    if (!can(user, "rentContracts.invoice") && !can(user, "rentContracts.editInvoice"))
      throw new AppError("Forbidden");
    return previewInstallment(d.id, user, d.amount ?? null);
  });
}

// إلغاء فاتورة الدفعة (للتصحيح وإصدارها تاني) - rentContracts.cancelInvoice
export async function cancelInstallmentInvoiceAction(id) {
  return runAction(idField, id, (d, user) => cancelInstallmentInvoice(d, user), {
    permission: "rentContracts.cancelInvoice",
    refresh: true,
  });
}

// حذف العقد (من غير فواتير) - rentContracts.delete
export async function deleteContractAction(id) {
  return runAction(idField, id, (d, user) => deleteContract(d, user), {
    permission: "rentContracts.delete",
  });
}
