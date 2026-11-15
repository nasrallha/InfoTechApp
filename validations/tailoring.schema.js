import { z } from "zod";
import { idField, imageField, optionalText, requestIdField } from "./common.schema";
import { KINSHIPS, OPEN_STATUSES, ORDER_STATUSES } from "@/lib/tailoring";

// ============================================================
// الخياط: الإعدادات (المقاسات والتفاصيل) + الأشخاص والمقاسات + طلبات التفصيل
// ============================================================

const requiredText = (max) =>
  z
    .string({ error: "RequiredField" })
    .trim()
    .min(1, "RequiredField")
    .max(max, "TextTooLong");

const dayField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ValidationError");
const sortField = z.number().int().min(0).max(9999).default(0);
const money = z.number({ error: "RequiredField" }).min(0, "MustBePositive");

// ---------------- الإعدادات ----------------
// خانة مقاس (الطول، الكتف ...)
export const fieldSchema = z.object({
  id: idField.optional(),
  arName: requiredText(60),
  enName: requiredText(60),
  sortOrder: sortField,
  isActive: z.boolean().default(true),
});

// مجموعة تفاصيل (الموديل، الرقبة ...)
export const styleGroupSchema = z.object({
  id: idField.optional(),
  arName: requiredText(60),
  enName: requiredText(60),
  multiple: z.boolean().default(false),
  sortOrder: sortField,
  isActive: z.boolean().default(true),
});

// اختيار جوه المجموعة (بصورة) - بيوصل FormData
export const styleChoiceSchema = z.object({
  id: idField.optional(),
  groupId: idField,
  arName: requiredText(60),
  enName: requiredText(60),
  sortOrder: sortField,
  isActive: z.boolean().default(true),
  image: imageField,
  removeImage: z.boolean().default(false),
  // شكله على الثوب التفاعلي
  part: z
    .string()
    .regex(/^[a-z]+:[a-zA-Z]+$/, "ValidationError")
    .nullish()
    .transform((v) => v || null),
  // صورة من مكتبة الرسومات (بدل الرفع)
  libraryImage: z
    .string()
    .regex(/^\/tailoring\/lib\/[a-z]+\/[a-z0-9-]+\.png$/, "ValidationError")
    .nullish()
    .transform((v) => v || null),
});

// سعر التفصيل الافتراضي + قسم الأقمشة
export const tailorSettingsSchema = z.object({
  sewPrice: money,
  deliveryDays: z.number().int().min(0, "MustBePositive").max(365, "ValueOutOfRange").default(7),
  fabricCategoryId: idField.nullish().transform((v) => v ?? null),
});

// ---------------- الأشخاص والمقاسات ----------------
export const phoneField = z
  .string({ error: "RequiredField" })
  .trim()
  .min(1, "RequiredField")
  .regex(/^\d{9,11}$/, "PhoneInvalid");

// البحث عن عميل (الاسم / الجوال / الكود / اسم الشخص)
export const customerSearchSchema = z.object({
  q: z.string().trim().max(100).default(""),
});

export const personSchema = z.object({
  id: idField.optional(),
  customerId: idField,
  name: requiredText(150),
  kinship: z.enum(KINSHIPS, "ValidationError").default("self"),
  notes: optionalText(500),
  isActive: z.boolean().default(true),
});

// المقاسات: { "<fieldId>": "52.5" } (نص عشان 52 1/2 وغيره)
const measuresField = z
  .record(z.string().regex(/^\d+$/), z.string().trim().max(20, "TextTooLong"))
  .default({});

export const measurementSchema = z.object({
  personId: idField,
  measures: measuresField,
  notes: optionalText(500),
});

// ---------------- طلب التفصيل ----------------
const lineSchema = z.object({
  // شخص موجود، أو شخص جديد بالاسم وصلة القرابة
  personId: idField.nullish(),
  personName: optionalText(150),
  kinship: z.enum(KINSHIPS, "ValidationError").default("self"),
  // المقاس المختار (آخر مقاس افتراضياً) - لو اتغيرت القيم بيتسجل مقاس جديد
  measurementId: idField.nullish(),
  measures: measuresField,
  // التفاصيل: [{ groupId, choiceIds }]
  styles: z
    .array(z.object({ groupId: idField, choiceIds: z.array(idField).max(30).default([]) }))
    .max(50)
    .default([]),
  fabricId: idField.nullish(),
  fabricQty: z.number().min(0, "MustBePositive").max(100000).default(0),
  fabricPrice: money.default(0),
  pieces: z.number({ error: "RequiredField" }).int().min(1, "ValueOutOfRange").max(1000),
  sewPrice: money,
  notes: optionalText(500),
});

// العربون: طريقة دفع + مبلغ (فاضي = كل الطلب آجل)
const paymentSchema = z
  .object({
    paymentMethodId: idField.nullish(),
    amount: z.number().min(0, "MustBePositive").nullish(),
    reference: optionalText(100),
  })
  .nullish();

const orderFields = {
  requestId: requestIdField,
  // عميل موجود، أو جديد بالجوال والاسم
  customerId: idField.nullish(),
  phone: optionalText(11),
  customerName: optionalText(255),
  deliveryDate: dayField,
  technicianId: idField.nullish(),
  notes: optionalText(1000),
  lines: z.array(lineSchema).min(1, "TailorNoLines").max(50),
  // خصم على الطلب كله (مبلغ أو نسبة) - بينزل خصم فاتورة
  discountType: z.enum(["amount", "percent"]).default("amount"),
  discountValue: z.number().min(0, "MustBePositive").default(0),
  payment: paymentSchema,
};
const percentMax = [
  (d) => d.discountType !== "percent" || d.discountValue <= 100,
  { message: "PercentMax", path: ["discountValue"] },
];
export const orderSchema = z.object(orderFields).refine(...percentMax);
// تعديل الطلب: نفس الحقول + رقمه
export const orderUpdateSchema = z.object({ ...orderFields, id: idField }).refine(...percentMax);

export const ordersListSchema = z.object({
  q: z.string().trim().max(100).default(""),
  from: dayField.nullish(),
  to: dayField.nullish(),
  // تاريخ الطلب أو موعد التسليم
  dateBy: z.enum(["order", "delivery"]).default("order"),
  status: z.enum(["all", "open", "late", ...ORDER_STATUSES]).default("open"),
  technicianId: idField.nullish(),
  page: z.number().int().min(1).max(10000).default(1),
  // التصدير: كل الطلبات المطابقة (مش الصفحة بس)
  all: z.boolean().default(false),
});

export const statusSchema = z.object({
  ids: z.array(idField).min(1, "RequiredField").max(500),
  status: z.enum(OPEN_STATUSES, "ValidationError"),
});

export const assignSchema = z.object({
  id: idField,
  technicianId: idField.nullish().transform((v) => v ?? null),
  deliveryDate: dayField.optional(),
});

// دفع المتبقي (سند قبض على العميل)
export const paySchema = z.object({
  id: idField,
  paymentMethodId: idField,
  amount: z.number({ error: "RequiredField" }).positive("MustBePositive"),
  reference: optionalText(100),
});

export const deliverSchema = z.object({
  id: idField,
  paymentMethodId: idField.nullish(),
  amount: z.number().min(0, "MustBePositive").nullish(),
  reference: optionalText(100),
});

export const cancelSchema = z.object({
  id: idField,
  reason: optionalText(255),
});
