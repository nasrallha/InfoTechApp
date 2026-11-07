import { z } from "zod";
import { idField, optionalText } from "./common.schema";
import { isDay } from "@/lib/dates";

// ============================================================
// الفنيون + المواعيد + عقود الصيانة الدورية
// ============================================================
const name = z
  .string({ error: "RequiredField" })
  .trim()
  .min(2, "RequiredField")
  .max(100, "TextTooLong");
const dayField = z.string().refine(isDay, "InvalidDate");
const dateTime = z.string().max(40).nullish();

const technicianFields = {
  arName: name,
  enName: name,
  phone: optionalText(30),
  commissionRate: z
    .number()
    .min(0, "MustBePositive")
    .max(100, "ValueOutOfRange")
    .default(0),
  // نسبة بيع الأصناف العادية (المستحضرات...)
  productRate: z
    .number()
    .min(0, "MustBePositive")
    .max(100, "ValueOutOfRange")
    .default(0),
  isActive: z.boolean().default(true),
  notes: optionalText(500),
  // استثناءات: قسم أو صنف بنسبة / مبلغ على الوحدة
  rates: z
    .array(
      z
        .object({
          categoryId: idField.nullish(),
          productId: idField.nullish(),
          rateType: z.enum(["percent", "amount"]).default("percent"),
          value: z.number().min(0, "MustBePositive").max(1_000_000),
        })
        .refine((r) => Boolean(r.categoryId) !== Boolean(r.productId), {
          message: "RequiredField",
        })
        .refine((r) => r.rateType !== "percent" || r.value <= 100, {
          message: "ValueOutOfRange",
          path: ["value"],
        }),
    )
    .max(200)
    .optional(),
};
export const createTechnicianSchema = z.object(technicianFields);
export const updateTechnicianSchema = z.object({
  ...technicianFields,
  id: idField,
});

// الفني والموعد على سطر الخدمة في الفاتورة
export const saleJobSchema = z
  .object({
    technicianId: idField.nullish(),
    at: dateTime,
    address: optionalText(500),
    note: optionalText(500),
    status: z.enum(["pending", "done"]).optional(),
    doneAt: dateTime,
  })
  .nullish();

export const jobsListSchema = z.object({
  from: dayField.optional(),
  to: dayField.optional(),
  technicianId: idField.optional(),
  type: z.enum(["all", "sale", "visit"]).default("all"),
});

export const updateSaleJobSchema = z.object({
  id: idField,
  status: z.enum(["pending", "done", "cancelled"]).optional(),
  at: dateTime,
  technicianId: idField.nullish(),
  note: optionalText(500),
});

const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "InvalidTime");

export const commissionSchema = z.object({
  from: dayField.optional(),
  to: dayField.optional(),
  // الوقت (اختياري): من يوم الساعة كذا لـ يوم الساعة كذا
  fromTime: timeField.nullish(),
  toTime: timeField.nullish(),
  technicianId: idField.optional(),
});

// ---------- عقود الصيانة ----------
const contractEditable = {
  deviceName: z
    .string({ error: "RequiredField" })
    .trim()
    .min(2, "RequiredField")
    .max(255, "TextTooLong"),
  serialText: optionalText(100),
  address: optionalText(500),
  amount: z.number().min(0, "MustBePositive").max(1_000_000_000).nullish(),
  technicianId: idField.nullish(),
  productId: idField.nullish(),
  notes: optionalText(1000),
};
export const createContractSchema = z.object({
  ...contractEditable,
  customerId: idField,
  intervalMonths: z.number().int().min(1, "ValueOutOfRange").max(60),
  startDate: dayField,
  endDate: dayField,
});
// التعديل: المدة والفترة كمان (الزيارات اللي لسه ما اتعملتش بتتجدول من جديد)
export const updateContractSchema = z.object({
  ...contractEditable,
  id: idField,
  intervalMonths: z.number().int().min(1, "ValueOutOfRange").max(60),
  startDate: dayField,
  endDate: dayField,
});
export const contractListSchema = z.object({
  status: z.enum(["active", "ended", "cancelled", "all"]).default("active"),
  q: z.string().trim().max(100).default(""),
});
export const updateVisitSchema = z.object({
  id: idField,
  status: z.enum(["pending", "done", "skipped"]).optional(),
  dueDate: dayField.optional(),
  technicianId: idField.nullish(),
  note: optionalText(500),
});
