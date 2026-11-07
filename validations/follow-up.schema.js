import { z } from "zod";
import { idField, optionalText } from "./common.schema";
import { isDay } from "@/lib/dates";

// ============================================================
// المتابعة الدورية (وحدة followUps)
// ============================================================
const dayField = z.string().refine(isDay, "InvalidDate");

export const followUpListSchema = z.object({
  filter: z
    .enum(["due", "overdue", "today", "soon", "later", "all", "stopped"])
    .default("due"),
  q: z.string().trim().max(100).default(""),
  customerId: idField.optional(),
});

export const followUpDoneSchema = z.object({
  id: idField,
  date: dayField.optional(),
  note: optionalText(500),
});

export const followUpPostponeSchema = z.object({
  id: idField,
  date: dayField,
  note: optionalText(500),
});

export const followUpStatusSchema = z.object({
  id: idField,
  active: z.boolean(),
  note: optionalText(500),
});

export const followUpUpdateSchema = z.object({
  id: idField,
  intervalDays: z.number().int().min(1, "ValueOutOfRange").max(3650),
  place: optionalText(100),
  address: optionalText(500),
  locationUrl: optionalText(500),
  phone: optionalText(30),
  notes: optionalText(500),
});

// تقرير المتابعات في فترة
export const followUpReportSchema = z.object({
  // من غير from/to = كل المواعيد
  from: dayField.optional(),
  to: dayField.optional(),
  months: z.number().int().min(1).max(60).optional(),
  status: z.enum(["all", "done", "overdue", "pending"]).default("all"),
  branchId: idField.optional(),
});
