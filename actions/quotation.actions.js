"use server";

// البوابة بين شاشات عروض الأسعار والسيرفر

import { runAction } from "@/lib/action";
import { idField } from "@/validations/common.schema";
import {
  createQuotationSchema,
  updateQuotationSchema,
} from "@/validations/sale.schema";
import {
  createQuotation,
  updateQuotation,
  deleteQuotation,
} from "@/services/quotation.service";

export async function createQuotationAction(input) {
  return runAction(
    createQuotationSchema,
    input,
    (d, user) => createQuotation(d, user),
    { permission: "quotations.create" },
  );
}

export async function updateQuotationAction(input) {
  return runAction(
    updateQuotationSchema,
    input,
    (d, user) => updateQuotation(d, user),
    { permission: "quotations.update" },
  );
}

export async function deleteQuotationAction(id) {
  return runAction(idField, id, (d, user) => deleteQuotation(d, user), {
    permission: "quotations.delete",
  });
}
