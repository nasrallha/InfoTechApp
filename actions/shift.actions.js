"use server";

// البوابة بين شاشات الورديات والسيرفر

import { runAction } from "@/lib/action";
import { idField } from "@/validations/common.schema";
import { openShiftSchema, closeShiftSchema } from "@/validations/sale.schema";
import { cashMovementSchema } from "@/validations/account.schema";
import {
  openShift,
  closeShift,
  getOpenShift,
  getShift,
  getOpeningSuggestion,
  addCashMovement,
} from "@/services/shift.service";

// فتح وردية (لمن يستخدم الكاشير)
export async function openShiftAction(input) {
  return runAction(openShiftSchema, input, (d, user) => openShift(d, user), {
    permission: "sales.pos",
    refresh: true,
  });
}

// قفل وردية بجرد الفلوس
export async function closeShiftAction(input) {
  return runAction(closeShiftSchema, input, (d, user) => closeShift(d, user), {
    refresh: true,
  });
}

// ورديتي المفتوحة الآن (أو null)
export async function getMyOpenShiftAction() {
  return runAction(null, null, (_, user) => getOpenShift(user));
}

// الوردية مع ملخصها (الفواتير، المدفوع بكل طريقة، النقدية المفروضة)
export async function getShiftAction(id) {
  return runAction(idField, id, (d, user) => getShift(d, user));
}

// المبلغ المقترح لرصيد أول المدة (المتروك في الدرج من الوردية السابقة)
export async function getOpeningSuggestionAction() {
  return runAction(null, null, (_, user) => getOpeningSuggestion(user), {
    permission: "sales.pos",
  });
}

// سحب / إضافة نقدية في الدرج
export async function addCashMovementAction(input) {
  return runAction(
    cashMovementSchema,
    input,
    (d, user) => addCashMovement(d, user),
    {
      permission: "shifts.cashMovement",
    },
  );
}
