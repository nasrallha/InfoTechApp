import { z } from "zod";
import { idField, optionalText, requestIdField } from "./common.schema";
import { isDay } from "@/lib/dates";
import { DISCOUNT_TYPES } from "./purchase.schema";

// كمية: أكبر من صفر وبحد أقصى 3 خانات عشرية
const qtyField = z
  .number({ error: "RequiredField" })
  .positive("MustBePositive")
  .max(1_000_000, "ValueOutOfRange")
  .refine(
    (v) => Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6,
    "QtyDecimals",
  );

const amountField = z
  .number({ error: "RequiredField" })
  .min(0, "MustBePositive")
  .max(1_000_000_000, "ValueOutOfRange");

const dayField = z
  .string({ error: "RequiredField" })
  .refine(isDay, "InvalidDate");

const discountFields = {
  discountType: z.enum(DISCOUNT_TYPES).default("amount"),
  discountValue: amountField.default(0),
};
const percentMax = (d) =>
  d.discountType !== "percent" || d.discountValue <= 100;

const paymentSchema = z.object({
  paymentMethodId: idField,
  amount: z
    .number({ error: "RequiredField" })
    .positive("MustBePositive")
    .max(1_000_000_000, "ValueOutOfRange"),
  reference: optionalText(100),
});
const paymentsField = z.array(paymentSchema).max(10).default([]);

// سطر صنف (فاتورة بيع أو عرض سعر)
const saleItemSchema = z
  .object({
    productId: idField,
    unitId: idField,
    qty: qtyField,
    price: amountField,
    ...discountFields,
    // ملاحظة / وصف السطر (اختياري)
    note: optionalText(500),
  })
  .refine(percentMax, { message: "PercentMax", path: ["discountValue"] });

// ------------------------------------------------------------
// فاتورة بيع (الكاشير أو الفاتورة العادية)
// ------------------------------------------------------------
const saleFields = {
  source: z.enum(["pos", "invoice"]).default("invoice"),
  // فاضي = عميل نقدي
  customerId: idField.nullish(),
  // تاريخ سابق: لمن يملك الصلاحية (وإلا الآن)
  date: dayField.optional(),
  ...discountFields,
  notes: optionalText(500),
  items: z.array(saleItemSchema).min(1, "NoItems").max(500),
  payments: paymentsField,
  // الكاشير: المبلغ الذي استلمه نقداً (لحساب الباقي للعميل)
  tenderedAmount: amountField.optional(),
  // تحويل من عرض سعر
  quotationId: idField.optional(),
  // فاتورة تصدير (خارج المملكة): ضريبة صفرية + فاتورة ضريبية للهيئة
  isExport: z.boolean().default(false),
};

export const createSaleSchema = z
  .object({ ...saleFields, requestId: requestIdField })
  .refine(percentMax, { message: "PercentMax", path: ["discountValue"] });

export const updateSaleSchema = z
  .object({ ...saleFields, id: idField })
  .refine(percentMax, { message: "PercentMax", path: ["discountValue"] });

// ------------------------------------------------------------
// مرتجع مبيعات (مربوط بفاتورة بيع)
// ------------------------------------------------------------
export const createSaleReturnSchema = z.object({
  saleId: idField,
  requestId: requestIdField,
  // تاريخ سابق: لمن يملك الصلاحية (وإلا الآن)
  date: dayField.optional(),
  notes: optionalText(500),
  items: z
    .array(z.object({ itemId: idField, qty: qtyField }))
    .min(1, "NoItems")
    .max(500),
  payments: paymentsField,
});

// البحث عن فاتورة للمرتجع: برقمها
export const findSaleSchema = z.object({
  value: z.string().trim().min(1, "RequiredField").max(50),
});

// ------------------------------------------------------------
// عرض سعر
// ------------------------------------------------------------
const quotationFields = {
  customerId: idField.nullish(),
  // عميل غير مسجل: اسمه فقط
  customerName: optionalText(255),
  validUntil: dayField,
  ...discountFields,
  notes: optionalText(1000),
  items: z.array(saleItemSchema).min(1, "NoItems").max(500),
};

export const createQuotationSchema = z
  .object(quotationFields)
  .refine(percentMax, { message: "PercentMax", path: ["discountValue"] });

export const updateQuotationSchema = z
  .object({ ...quotationFields, id: idField })
  .refine(percentMax, { message: "PercentMax", path: ["discountValue"] });

// ------------------------------------------------------------
// الورديات
// ------------------------------------------------------------
export const openShiftSchema = z.object({
  openingCash: amountField.default(0),
  notes: optionalText(500),
});

// عدّ الفئات: عدد الورقات من كل فئة + الفكة (مبلغ)
const countField = z
  .number()
  .int("ValidationError")
  .min(0, "MustBePositive")
  .max(100_000, "ValueOutOfRange");
const denominationsSchema = z
  .object({
    500: countField.default(0),
    200: countField.default(0),
    100: countField.default(0),
    50: countField.default(0),
    20: countField.default(0),
    10: countField.default(0),
    5: countField.default(0),
    1: countField.default(0),
    coins: amountField.default(0),
  })
  .strict();

export const closeShiftSchema = z
  .object({
    id: idField,
    denominations: denominationsSchema.optional(),
    countedCash: amountField.optional(),
    // إجمالي إيصال تقفيل جهاز الشبكة
    cardCounted: amountField.nullish(),
    // المورّد للخزنة (والباقي يُترك في الدرج للوردية التالية)
    depositedCash: amountField.default(0),
    notes: optionalText(500),
  })
  .refine((d) => d.denominations || d.countedCash != null, {
    message: "RequiredField",
    path: ["countedCash"],
  });

// ------------------------------------------------------------
// الأصناف في شاشات البيع
// ------------------------------------------------------------
export const saleSearchSchema = z.string().trim().max(100);

export const saleBrowseSchema = z.object({
  q: z.string().trim().max(100).default(""),
  categoryId: idField.optional(),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(200).default(20),
});
