import { z } from "zod";
import { idField } from "./common.schema";
import { isDay } from "@/lib/dates";

// ============================================================
// المناديب والعمولات (وحدة salesReps)
// ============================================================
const dayField = z.string().refine(isDay, "InvalidDate");
const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "InvalidTime");

// تقرير العمولات: الفترة (والوقت اختياري) + الفرع + المندوب
export const salesRepsReportSchema = z.object({
  from: dayField.optional(),
  to: dayField.optional(),
  fromTime: timeField.nullish(),
  toTime: timeField.nullish(),
  branchId: idField.nullish(),
  salesRepId: idField.nullish(),
});

// حفظ نسبة المندوب من التقرير
export const repRateSchema = z.object({
  userId: idField,
  rate: z.number({ error: "FieldOnlyNumber" }).min(0, "MustBePositive").max(100, "PercentMax"),
});
