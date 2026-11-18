"use server";

// البوابة بين شاشات الورديات والسيرفر

import { z } from "zod";
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
  closeBranchShift,
  drawerChoices,
  joinDrawer,
  leaveDrawer,
  saveShiftSettings,
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

// نافذة الكاشير: وردية الفرع المفتوحة وأدراجها (فتح درج / الانضمام)
export async function getDrawerChoicesAction() {
  return runAction(null, null, (_, user) => drawerChoices(user), {
    permission: "sales.pos",
  });
}

// الانضمام لدرج كاشير مفتوح (المدير / المشرف / المالك)
export async function joinDrawerAction(id) {
  return runAction(idField, id, (d, user) => joinDrawer(d, user), {
    permission: "shifts.joinDrawer",
    refresh: true,
  });
}

// الخروج من الدرج المنضم له
export async function leaveDrawerAction() {
  return runAction(null, null, (_, user) => leaveDrawer(user), {
    refresh: true,
  });
}

// قفل وردية الفرع يدوي (بعد قفل كل الأدراج)
export async function closeBranchShiftAction(id) {
  return runAction(idField, id, (d, user) => closeBranchShift(d, user), {
    permission: "shifts.close",
    refresh: true,
  });
}

// إعدادات الورديات (المالك): الأدراج والقفل وأوقات الورديات
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "ValidationError");
const shiftSettingsSchema = z.object({
  multiDrawer: z.boolean(),
  autoClose: z.boolean(),
  periods: z
    .array(
      z.object({
        arName: z.string().trim().min(1, "RequiredField").max(50, "TextTooLong"),
        enName: z.string().trim().max(50, "TextTooLong").default(""),
        start: TIME,
        end: TIME,
      }),
    )
    .max(6),
});

export async function saveShiftSettingsAction(input) {
  return runAction(shiftSettingsSchema, input, (d) => saveShiftSettings(d), {
    permission: "systemSettings.shifts",
    refresh: true,
  });
}
