"use server";

// البوابة بين شاشة طرق الدفع والسيرفر

import { runAction } from "@/lib/action";
import {
  createPaymentMethodSchema,
  updatePaymentMethodSchema,
  deletePaymentMethodsSchema,
} from "@/validations/payment-method.schema";
import {
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethods,
} from "@/services/payment-method.service";

export async function createPaymentMethodAction(input) {
  return runAction(createPaymentMethodSchema, input, (d) => createPaymentMethod(d), {
    permission: "paymentMethods.create",
    refresh: true,
  });
}

export async function updatePaymentMethodAction(input) {
  return runAction(updatePaymentMethodSchema, input, (d) => updatePaymentMethod(d), {
    permission: "paymentMethods.update",
    refresh: true,
  });
}

export async function deletePaymentMethodsAction(ids) {
  return runAction(deletePaymentMethodsSchema, ids, (d) => deletePaymentMethods(d), {
    permission: "paymentMethods.delete",
    refresh: true,
  });
}
