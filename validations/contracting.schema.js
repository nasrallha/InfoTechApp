import { z } from "zod";
import { idField, optionalText } from "./common.schema";
import { CERT_MODES, CONTRACT_KINDS, PAYMENT_KINDS } from "@/lib/contracting";

// ============================================================
// المقاولات: النماذج والعقود والمقايسة وأوامر التغيير والمستخلصات والتحصيل
// ============================================================

const requiredText = (max) =>
  z
    .string({ error: "RequiredField" })
    .trim()
    .min(1, "RequiredField")
    .max(max, "TextTooLong");

const optionalId = idField.nullish().transform((v) => v ?? null);

const dayText = z
  .string({ error: "RequiredField" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "ValidationError");
const optionalDay = dayText.nullish().transform((v) => v || null);

// نسبة من 0 لـ 100
const pctField = z
  .number({ error: "RequiredField" })
  .min(0, "MustBePositive")
  .max(100, "PercentMax")
  .default(0);

const moneyIn = z
  .number({ error: "RequiredField" })
  .min(0, "MustBePositive")
  .max(10_000_000_000, "ValueOutOfRange");

// كمية بـ 3 خانات عشرية بالكتير
const qtyIn = z
  .number({ error: "RequiredField" })
  .max(100_000_000, "ValueOutOfRange")
  .refine((v) => Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6, "QtyDecimals");

// نموذج صيغة العقد
export const templateSchema = z.object({
  id: idField.optional(),
  name: requiredText(100),
  kind: z.enum(CONTRACT_KINDS, "ValidationError").nullish().transform((v) => v ?? null),
  content: requiredText(30_000),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

// ------------------------------------------------------------
// العقد + المقايسة
// items: البنود (id = بند محفوظ في التعديل)
// content: نص العقد بعد ملء الخانات (ممكن يتعدل قبل الحفظ)
// ------------------------------------------------------------
const itemSchema = z.object({
  id: idField.optional(),
  itemNo: optionalText(30),
  description: requiredText(500),
  unitName: optionalText(30),
  qty: qtyIn.refine((v) => v > 0, "MustBePositive"),
  price: moneyIn,
  // الإجمالي (فاضي = الكمية × السعر)
  amount: moneyIn.nullish(),
});

export const contractSchema = z
  .object({
    id: idField.optional(),
    kind: z.enum(CONTRACT_KINDS, "ValidationError"),
    // قيمة العقد قبل الضريبة (البنود بتتكتب في المستخلص، مش في العقد)
    contractValue: moneyIn.default(0),
    // رصيد دفعة مقدمة اتفوترت قبل كده برّه البرنامج (قبل الضريبة)
    priorAdvance: moneyIn.default(0),
    customerId: optionalId,
    supplierId: optionalId,
    // عقد الباطن: عقد المشروع مع المالك
    parentId: optionalId,
    projectName: requiredText(200),
    projectLocation: optionalText(255),
    refNo: optionalText(60),
    signDate: dayText,
    startDate: optionalDay,
    endDate: dayText,
    advancePct: pctField,
    recoveryPct: pctField,
    retentionPct: pctField,
    retentionReleaseDate: optionalDay,
    penaltyPerDay: moneyIn.default(0),
    penaltyMaxPct: pctField,
    items: z.array(itemSchema).max(1000).default([]),
    templateId: optionalId,
    content: z.string().max(60_000, "TextTooLong").nullish(),
    notes: optionalText(1000),
  })
  .refine((d) => (d.kind === "owner" ? d.customerId : d.supplierId), {
    message: "RequiredField",
    path: ["party"],
  })
  // قيمة العقد مطلوبة (العقود القديمة: مجموع المقايسة)
  .refine((d) => d.items.length > 0 || d.contractValue > 0, {
    message: "ContractValueRequired",
    path: ["contractValue"],
  })
  .refine((d) => d.endDate >= (d.startDate || d.signDate), {
    message: "ContractEndBeforeStart",
    path: ["endDate"],
  });

// ------------------------------------------------------------
// أمر التغيير: سطور تعدّل كمية بند موجود (+ / -) أو تضيف بند جديد
// ------------------------------------------------------------
export const changeOrderSchema = z.object({
  contractId: idField,
  date: dayText,
  title: requiredText(255),
  notes: optionalText(1000),
  lines: z
    .array(
      z
        .object({
          // بند موجود (فاضي = بند جديد)
          itemId: optionalId,
          itemNo: optionalText(30),
          description: optionalText(500),
          unitName: optionalText(30),
          qtyDelta: qtyIn.refine((v) => v !== 0, "MustBePositive"),
          price: moneyIn,
        })
        .refine((l) => l.itemId || (l.description && l.qtyDelta > 0), {
          message: "RequiredField",
          path: ["description"],
        }),
    )
    .min(1, "NoItems")
    .max(500),
});

// ------------------------------------------------------------
// المستخلص
// lines: بند من المقايسة (itemId + الكمية الحالية) أو بند حر (الوصف + الكمية + السعر)
//   المبلغ الإجمالي (lump): سطر حر أو أكتر بالمبلغ (الكمية 1)
// recovery / retention: قيمة بإيد المستخدم (فاضي = بالنسبة من العقد)
// supplierInvoiceNo: رقم فاتورة مقاول الباطن (عقد الباطن)
// ------------------------------------------------------------
export const certificateSchema = z.object({
  contractId: idField,
  date: dayText,
  periodFrom: optionalDay,
  periodTo: optionalDay,
  mode: z.enum(CERT_MODES, "ValidationError"),
  isFinal: z.boolean().default(false),
  lines: z
    .array(
      z
        .object({
          itemId: optionalId,
          description: optionalText(500),
          unitName: optionalText(30),
          // وحدة من الوحدات المتسجلة (متر مربع ...) ← بتطلع في الفاتورة (فاضي = خدمة)
          unitId: optionalId,
          qty: qtyIn.refine((v) => v >= 0, "MustBePositive"),
          price: moneyIn.default(0),
        })
        .refine((l) => l.itemId || l.description, {
          message: "RequiredField",
          path: ["description"],
        }),
    )
    .max(1000)
    .default([]),
  recovery: moneyIn.nullish().transform((v) => (v == null ? null : v)),
  retention: moneyIn.nullish().transform((v) => (v == null ? null : v)),
  penalty: moneyIn.default(0),
  supplierInvoiceNo: optionalText(50),
  notes: optionalText(1000),
  // السداد على فاتورة المستخلص: من غير طريقة دفع ← آجل
  // paidAmount فاضي ← الصافي المستحق كله (الضمان بيفضل على الفاتورة لحد الإفراج)
  paymentMethodId: idField.nullish().transform((v) => v ?? null),
  reference: optionalText(100),
  paidAmount: moneyIn.nullish().transform((v) => (v == null ? null : v)),
  // رقم المستخلص عند العميل (اختياري)
  clientRef: optionalText(60),
});

// ------------------------------------------------------------
// تعديل المستخلص وفاتورته بنفس رقمها (صلاحية «تعديل فاتورة الدفعة»)
// lines: البنود الحرة (المستخلص بالمبلغ الإجمالي / السريع) - فاضي = زي ما هي
// recovery / retention: مبالغ | السداد زي الإنشاء
// ------------------------------------------------------------
export const updateCertificateSchema = z.object({
  id: idField,
  lines: z
    .array(
      z.object({
        description: requiredText(500),
        unitName: optionalText(30),
        unitId: optionalId,
        qty: qtyIn.refine((v) => v > 0, "MustBePositive"),
        price: moneyIn,
      }),
    )
    .max(500)
    .nullish(),
  recovery: moneyIn.default(0),
  retention: moneyIn.default(0),
  clientRef: optionalText(60),
  notes: optionalText(1000),
  paymentMethodId: idField.nullish().transform((v) => v ?? null),
  reference: optionalText(100),
  paidAmount: moneyIn.nullish().transform((v) => (v == null ? null : v)),
});

// ------------------------------------------------------------
// المستخلص السريع (من غير عقد): العميل + البنود (أو إجمالي واحد)
// استرداد الدفعة المقدمة وحجز الضمان: نسبة من قيمة الأعمال أو مبلغ
// ------------------------------------------------------------
const pctOrAmount = z.enum(["pct", "amount"], "ValidationError").default("pct");
export const quickCertificateSchema = z
  .object({
    customerId: idField,
    date: dayText,
    clientRef: optionalText(60),
    lines: z
      .array(
        z.object({
          description: requiredText(500),
          unitName: optionalText(30),
          unitId: optionalId,
          qty: qtyIn.refine((v) => v > 0, "MustBePositive"),
          price: moneyIn,
        }),
      )
      .min(1, "NoItems")
      .max(500),
    recoveryType: pctOrAmount,
    recoveryValue: moneyIn.default(0),
    retentionType: pctOrAmount,
    retentionValue: moneyIn.default(0),
    paymentMethodId: idField.nullish().transform((v) => v ?? null),
    reference: optionalText(100),
    paidAmount: moneyIn.nullish().transform((v) => (v == null ? null : v)),
    notes: optionalText(1000),
  })
  .refine((d) => d.recoveryType !== "pct" || d.recoveryValue <= 100, { message: "PercentMax", path: ["recoveryValue"] })
  .refine((d) => d.retentionType !== "pct" || d.retentionValue <= 100, { message: "PercentMax", path: ["retentionValue"] });

// فاتورة الدفعة المقدمة + السداد عليها (زي فواتير دفعات الإيجار)
// - من غير طريقة دفع ← آجل على الطرف (يتحصّل بسند بعدين)
// - paidAmount فاضي ← مدفوعة بالكامل | أقل من الإجمالي ← جزئي والباقي آجل
// supplierInvoiceNo: رقم فاتورة مقاول الباطن (عقد الباطن)
// amount: التعديل بس (قيمة الدفعة المقدمة قبل الضريبة)
export const advanceSchema = z.object({
  contractId: idField,
  supplierInvoiceNo: optionalText(50),
  paymentMethodId: idField.nullish().transform((v) => v ?? null),
  reference: optionalText(100),
  paidAmount: moneyIn.nullish().transform((v) => (v == null ? null : v)),
  amount: moneyIn.refine((v) => v > 0, "MustBePositive").nullish(),
});

// التحصيل من المالك / السداد لمقاول الباطن (سند قبض / صرف)
export const paymentSchema = z.object({
  contractId: idField,
  kind: z.enum(PAYMENT_KINDS, "ValidationError"),
  paymentMethodId: idField,
  amount: moneyIn.refine((v) => v > 0, "MustBePositive"),
  reference: optionalText(100),
  notes: optionalText(500),
});

// حالة العقد: إقفال (منتهي) / إعادة فتح / إلغاء
export const statusSchema = z.object({
  id: idField,
  status: z.enum(["active", "completed", "cancelled"], "ValidationError"),
});
