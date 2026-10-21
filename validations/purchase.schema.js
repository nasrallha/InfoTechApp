import { z } from "zod";
import { idField, optionalText, requestIdField } from "./common.schema";
import { TAX_MODES } from "./system-settings.schema";
import { isDay } from "@/lib/dates";

export const DISCOUNT_TYPES = ["amount", "percent"];

// كمية: أكبر من صفر وبحد أقصى 3 خانات عشرية (للأصناف الموزونة)
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

// يوم بصيغة YYYY-MM-DD
const dayField = z
  .string({ error: "RequiredField" })
  .refine(isDay, "InvalidDate");

// خصم: نوعه وقيمته (النسبة لا تتجاوز 100)
const discountFields = {
  discountType: z.enum(DISCOUNT_TYPES).default("amount"),
  discountValue: amountField.default(0),
};
const percentMax = (d) =>
  d.discountType !== "percent" || d.discountValue <= 100;

// سطر دفع: طريقة الدفع والمبلغ ورقم العملية (لو مطلوب)
const paymentSchema = z.object({
  paymentMethodId: idField,
  amount: z
    .number({ error: "RequiredField" })
    .positive("MustBePositive")
    .max(1_000_000_000, "ValueOutOfRange"),
  reference: optionalText(100),
});
const paymentsField = z.array(paymentSchema).max(10).default([]);

// ------------------------------------------------------------
// فاتورة شراء
// ------------------------------------------------------------
const purchaseItemSchema = z
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

const purchaseFields = {
  // المستودع: يُقبل فقط لمن يملك صلاحية اختياره، وإلا مستودع الفرع
  warehouseId: idField.optional(),
  supplierId: idField,
  supplierInvoiceNo: z
    .string({ error: "RequiredField" })
    .trim()
    .min(1, "RequiredField")
    .max(50, "TextTooLong"),
  supplierInvoiceDate: dayField,
  // تاريخ التسجيل: يُقبل فقط لمن يملك الصلاحية، وإلا تاريخ اليوم
  date: dayField.optional(),
  taxMode: z.enum(TAX_MODES, "ValidationError"),
  ...discountFields,
  notes: optionalText(500),
  items: z.array(purchaseItemSchema).min(1, "NoItems").max(500),
  payments: paymentsField,
};

export const createPurchaseSchema = z
  .object({ ...purchaseFields, requestId: requestIdField })
  .refine(percentMax, { message: "PercentMax", path: ["discountValue"] });

// تعديل فاتورة شراء: نفس الحقول + رقم الفاتورة
export const updatePurchaseSchema = z
  .object({ ...purchaseFields, id: idField })
  .refine(percentMax, { message: "PercentMax", path: ["discountValue"] });

// ------------------------------------------------------------
// مرتجع مشتريات (مربوط بفاتورة شراء)
// items: سطور الفاتورة الأصلية المختارة والكمية المرتجعة من كل سطر
// ------------------------------------------------------------
export const createPurchaseReturnSchema = z.object({
  purchaseId: idField,
  requestId: requestIdField,
  date: dayField.optional(),
  // رقم إشعار المورد (اختياري)
  supplierInvoiceNo: optionalText(50),
  notes: optionalText(500),
  items: z
    .array(z.object({ itemId: idField, qty: qtyField }))
    .min(1, "NoItems")
    .max(500),
  payments: paymentsField,
});

// البحث عن فاتورة للمرتجع: برقمنا أو برقم فاتورة المورد
export const findPurchaseSchema = z.object({
  by: z.enum(["number", "supplierInvoiceNo"]),
  value: z.string().trim().min(1, "RequiredField").max(50),
});

// بحث الأصناف في شاشة الشراء
export const productSearchSchema = z.string().trim().max(100);

// تصفح الأصناف في نافذة الاختيار
export const productBrowseSchema = z.object({
  q: z.string().trim().max(100).default(""),
  categoryId: idField.optional(),
  page: z.number().int().min(1).max(10_000).default(1),
});
