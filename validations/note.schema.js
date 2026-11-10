import { z } from "zod";
import { idField, optionalText, requestIdField } from "./common.schema";
import { isDay } from "@/lib/dates";
import { CUSTOM_KIND, NOTE_LINE_KEYS, noteLineKind } from "@/lib/note-lines";
import { TAX_CATEGORIES } from "@/lib/zatca-tax";

// ============================================================
// الإشعارات الدائنة والمدينة (العملاء والموردين)
// ============================================================

const qtyField = z
  .number({ error: "RequiredField" })
  .positive("MustBePositive")
  .max(1_000_000, "ValueOutOfRange")
  .refine(
    (v) => Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6,
    "QtyDecimals",
  );

const positiveAmount = z
  .number({ error: "RequiredField" })
  .positive("MustBePositive")
  .max(1_000_000_000, "ValueOutOfRange");

const dayField = z
  .string({ error: "RequiredField" })
  .refine(isDay, "InvalidDate");

const paymentsField = z
  .array(
    z.object({
      paymentMethodId: idField,
      amount: positiveAmount,
      reference: optionalText(100),
    }),
  )
  .max(10)
  .default([]);

// سطر الإشعار: صنف (تصحيح سعر) أو بند حر بوصف ومبلغ
const noteLineSchema = z
  .object({
    // بند ثابت، أو بند مضاف من المستخدم ("c" + رقمه)
    kind: z.union([z.enum(NOTE_LINE_KEYS), z.string().regex(CUSTOM_KIND)]),
    productId: idField.nullish(),
    unitId: idField.nullish(),
    // البند الحر: الكمية 1 والسعر = المبلغ
    qty: qtyField.default(1),
    // الصنف: فرق السعر للوحدة / البند الحر: المبلغ
    price: positiveAmount,
    // الوصف عربي (بيتبعت في الـ XML) وإنجليزي (للطباعة)
    description: optionalText(150),
    descriptionEn: optionalText(150),
    taxRate: z
      .number({ error: "RequiredField" })
      .min(0, "MustBePositive")
      .max(100, "ValueOutOfRange"),
    taxCategory: z.enum(TAX_CATEGORIES).default("S"),
    taxExemptionCode: optionalText(20),
  })
  .refine((l) => !noteLineKind(l.kind)?.product || (l.productId && l.unitId), {
    message: "RequiredField",
    path: ["productId"],
  })
  .refine((l) => noteLineKind(l.kind)?.product || Boolean(l.description), {
    message: "RequiredField",
    path: ["description"],
  });

const noteFields = {
  type: z.enum(["credit", "debit"]),
  requestId: requestIdField,
  // الفاتورة الأصلية (اختيارية)
  originalId: idField.nullish(),
  // العميل / المورد (لو مفيش فاتورة)
  partyId: idField.nullish(),
  // مرجع الفاتورة لو الإشعار مش مربوط بفاتورة في البرنامج (عقد / أكتر من فاتورة)
  billingRef: optionalText(100),
  // سبب الإشعار (إلزامي)
  reason: z
    .string({ error: "RequiredField" })
    .trim()
    .min(1, "RequiredField")
    .max(500, "ValueOutOfRange"),
  // السبب بالإنجليزي (للطباعة، اختياري)
  reasonEn: optionalText(500),
  // تاريخ سابق: بالصلاحية (وإلا الآن)
  date: dayField.optional(),
  // المبالغ المكتوبة شاملة الضريبة؟
  pricesIncludeTax: z.boolean().default(false),
  notes: optionalText(500),
  lines: z.array(noteLineSchema).min(1, "NoItems").max(200),
  payments: paymentsField,
};

const refRequired = (d) => Boolean(d.originalId || d.billingRef);

// إشعار للعميل (بيتبعت للهيئة لو الفرع مربوط)
export const createSaleNoteSchema = z
  .object({ ...noteFields, zatcaSend: z.boolean().optional() })
  .refine(refRequired, { message: "NoteRefRequired", path: ["billingRef"] });

// إشعار من المورد (تسجيل بس): رقم إشعار المورد وتاريخه
export const createPurchaseNoteSchema = z
  .object({
    ...noteFields,
    supplierNoteNo: optionalText(50),
    supplierNoteDate: dayField.nullish(),
  })
  .refine(refRequired, { message: "NoteRefRequired", path: ["billingRef"] })
  .refine((d) => d.originalId || d.partyId, {
    message: "RequiredField",
    path: ["partyId"],
  });

// البحث عن الفاتورة الأصلية: برقمها (أو رقم فاتورة المورد)
export const findNoteInvoiceSchema = z.object({
  value: z.string().trim().min(1, "RequiredField").max(50),
});

export const noteProductSearchSchema = z.string().trim().max(100);

// بند إشعار جديد / تعديل (القائمة المشتركة بين العملاء والموردين)
export const noteLineItemSchema = z
  .object({
    id: idField.nullish(),
    arName: z
      .string()
      .trim()
      .min(1, "RequiredField")
      .max(100, "ValueOutOfRange"),
    enName: z.string().trim().max(100, "ValueOutOfRange").default(""),
    forCredit: z.boolean().default(true),
    forDebit: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.forCredit || d.forDebit, {
    message: "NoteItemTypeRequired",
    path: ["forCredit"],
  });

// سبب إشعار جديد / تعديل (القائمة المشتركة بين العملاء والموردين)
export const noteReasonSchema = z
  .object({
    id: idField.nullish(),
    label: z
      .string()
      .trim()
      .min(1, "RequiredField")
      .max(500, "ValueOutOfRange"),
    // الاسم الإنجليزي (اختياري)
    enLabel: optionalText(500),
    forCredit: z.boolean().default(true),
    forDebit: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.forCredit || d.forDebit, {
    message: "NoteItemTypeRequired",
    path: ["forCredit"],
  });

// تعديل إشعار: نفس الحقول + رقمه (النوع مبيتغيرش)
export const updateSaleNoteSchema = z
  .object({
    ...noteFields,
    id: idField,
    zatcaSend: z.boolean().optional(),
  })
  .refine(refRequired, { message: "NoteRefRequired", path: ["billingRef"] });

export const updatePurchaseNoteSchema = z
  .object({
    ...noteFields,
    id: idField,
    supplierNoteNo: optionalText(50),
    supplierNoteDate: dayField.nullish(),
  })
  .refine(refRequired, { message: "NoteRefRequired", path: ["billingRef"] })
  .refine((d) => d.originalId || d.partyId, {
    message: "RequiredField",
    path: ["partyId"],
  });
