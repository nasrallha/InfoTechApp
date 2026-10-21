import { z } from "zod";
import {
  idField,
  nameField,
  optionalText,
  requestIdField,
} from "./common.schema";
import { isDay } from "@/lib/dates";

const dayField = z
  .string({ error: "RequiredField" })
  .refine(isDay, "InvalidDate");

const amountField = z
  .number({ error: "RequiredField" })
  .positive("MustBePositive")
  .max(1_000_000_000, "ValueOutOfRange");

// ------------------------------------------------------------
// سند قبض / صرف / تسوية
// ------------------------------------------------------------
export const createVoucherSchema = z.object({
  requestId: requestIdField,
  type: z.enum(["receipt", "payment", "settlement"]),
  partyType: z.enum(["customer", "supplier", "expense", "other"]),
  customerId: idField.nullish(),
  supplierId: idField.nullish(),
  expenseCategoryId: idField.nullish(),
  partyName: optionalText(255),
  paymentMethodId: idField.nullish(),
  amount: amountField,
  reference: optionalText(100),
  date: dayField.optional(),
  notes: optionalText(500),
});

export const listVouchersSchema = z.object({
  type: z.enum(["receipt", "payment", "settlement"]),
  q: z.string().trim().max(100).default(""),
  page: z.number().int().min(1).max(10_000).default(1),
});

// رصيد طرف وفواتيره المفتوحة (لشاشة السند)
export const partyAccountSchema = z.object({
  kind: z.enum(["customer", "supplier"]),
  id: idField,
});

// كشف حساب
export const statementSchema = z.object({
  kind: z.enum(["customer", "supplier"]),
  id: idField,
  from: dayField.optional(),
  to: dayField.optional(),
});

// ------------------------------------------------------------
// بنود المصروفات
// ------------------------------------------------------------
export const expenseCategorySchema = z.object({
  id: idField.optional(),
  arName: nameField(100),
  enName: nameField(100),
  isActive: z.boolean().default(true),
});

// ------------------------------------------------------------
// سحب / إضافة نقدية للدرج
// ------------------------------------------------------------
export const cashMovementSchema = z.object({
  type: z.enum(["in", "out"]),
  amount: amountField,
  reason: optionalText(255),
});
