import { z } from "zod";
import { idField, optionalText } from "./common.schema";
import { UNIT_KINDS, USE_TYPES } from "@/lib/rent";

// ============================================================
// تأجير العقارات: الملّاك والعقارات والوحدات ونماذج العقود
// ============================================================

const requiredText = (max) =>
  z
    .string({ error: "RequiredField" })
    .trim()
    .min(1, "RequiredField")
    .max(max, "TextTooLong");

const optionalId = idField.nullish().transform((v) => v ?? null);

// المالك
export const ownerSchema = z.object({
  id: idField.optional(),
  name: requiredText(150),
  phone: optionalText(20),
  idNumber: optionalText(30),
  notes: optionalText(500),
  isActive: z.boolean().default(true),
});

// العقار (عمارة / مجمّع)
export const propertySchema = z.object({
  id: idField.optional(),
  name: requiredText(150),
  city: optionalText(100),
  district: optionalText(100),
  address: optionalText(255),
  notes: optionalText(500),
  ownerId: optionalId,
  isActive: z.boolean().default(true),
});

// الوحدة: التفاصيل الحرة (عداد المياه / الكهرباء / عدد الغرف ...)
export const unitSchema = z.object({
  id: idField.optional(),
  propertyId: idField,
  unitNo: requiredText(30),
  kind: z.enum(UNIT_KINDS, "ValidationError"),
  useType: z.enum(USE_TYPES, "ValidationError"),
  floor: optionalText(20),
  area: z.number().min(0, "MustBePositive").max(1_000_000, "ValueOutOfRange").nullish(),
  annualRent: z.number({ error: "RequiredField" }).min(0, "MustBePositive"),
  details: z
    .array(
      z.object({
        label: requiredText(60),
        value: z.string().trim().max(200, "TextTooLong").default(""),
      }),
    )
    .max(30)
    .default([]),
  notes: optionalText(500),
  isActive: z.boolean().default(true),
});

// نموذج صيغة العقد
export const templateSchema = z.object({
  id: idField.optional(),
  name: requiredText(100),
  useType: z.enum(USE_TYPES, "ValidationError").nullish().transform((v) => v ?? null),
  content: requiredText(30_000),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

// ------------------------------------------------------------
// عقد الإيجار: وحدة أو أكتر + المدة + فترة السداد ← جدول الدفعات
// content: نص العقد بعد ملء الخانات (ممكن يتعدل قبل الحفظ)
// ------------------------------------------------------------
const dayText = z
  .string({ error: "RequiredField" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "ValidationError");

export const contractSchema = z
  .object({
    id: idField.optional(),
    customerId: idField,
    ejarNo: optionalText(40),
    startDate: dayText,
    endDate: dayText,
    payEvery: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
    units: z
      .array(
        z.object({
          unitId: idField,
          annualRent: z.number({ error: "RequiredField" }).min(0, "MustBePositive"),
        }),
      )
      .min(1, "RentUnitsRequired")
      .max(50),
    templateId: optionalId,
    content: z.string().max(60_000, "TextTooLong").nullish(),
    notes: optionalText(1000),
    // التجديد: العقد القديم
    renewedFromId: optionalId,
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "RentEndBeforeStart",
    path: ["endDate"],
  })
  .refine((d) => new Set(d.units.map((u) => u.unitId)).size === d.units.length, {
    message: "RentUnitRepeated",
    path: ["units"],
  });

// الخروج المبكر: التاريخ + السبب
export const terminateSchema = z.object({
  id: idField,
  exitDate: dayText,
  reason: optionalText(255),
});
