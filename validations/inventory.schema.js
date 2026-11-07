import { z } from "zod";
import { idField, optionalText } from "./common.schema";
import { isDay } from "@/lib/dates";

// كمية بحد أقصى 3 خانات عشرية (للأصناف الموزونة)
const decimals3 = (v) => Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6;

const qtyField = z
  .number({ error: "RequiredField" })
  .positive("MustBePositive")
  .max(1_000_000, "ValueOutOfRange")
  .refine(decimals3, "QtyDecimals");

// كمية صفر أو أكبر (المستلم فعلاً، أو الموجود في الجرد)
const zeroOrMoreQty = z
  .number({ error: "RequiredField" })
  .min(0, "MustBePositive")
  .max(1_000_000, "ValueOutOfRange")
  .refine(decimals3, "QtyDecimals");

const pageField = z.number().int().min(1).max(10_000).default(1);

// ------------------------------------------------------------
// التحويلات
// ------------------------------------------------------------
export const createTransferSchema = z.object({
  fromWarehouseId: idField,
  toWarehouseId: idField,
  date: z.string().refine(isDay, "InvalidDate").optional(),
  notes: optionalText(255),
  items: z
    .array(
      z.object({
        productId: idField,
        unitId: idField,
        qty: qtyField,
      }),
    )
    .min(1, "NoItems")
    .max(500),
});

export const receiveTransferSchema = z.object({
  id: idField,
  items: z
    .array(z.object({ itemId: idField, receivedQty: zeroOrMoreQty }))
    .max(500)
    .default([]),
});

export const transferListSchema = z.object({
  status: z.enum(["sent", "received", "cancelled"]).optional(),
  q: z.string().trim().max(50).default(""),
  page: pageField,
});

// ------------------------------------------------------------
// الجرد
// ------------------------------------------------------------
const countItems = z
  .array(z.object({ productId: idField, countedQty: zeroOrMoreQty }))
  .min(1, "NoItems")
  .max(2000)
  // الصنف مرة واحدة فقط في الجرد
  .refine(
    (items) => new Set(items.map((i) => i.productId)).size === items.length,
    "DuplicateItems",
  );

export const createCountSchema = z.object({
  warehouseId: idField,
  notes: optionalText(255),
  items: countItems,
});

export const updateCountSchema = z.object({
  id: idField,
  notes: optionalText(255),
  items: countItems,
});

export const countSheetSchema = z.object({
  warehouseId: idField,
  categoryId: idField.optional(),
  productIds: z.array(idField).max(2000).optional(),
});

// ------------------------------------------------------------
// الأرصدة وكارت الصنف
// ------------------------------------------------------------
export const stockBalancesSchema = z.object({
  warehouseId: idField.optional(), // بدون = كل المستودعات المسموحة
  q: z.string().trim().max(100).default(""),
  categoryId: idField.optional(),
  onlyNegative: z.boolean().default(false),
  page: pageField,
});

export const itemCardSchema = z.object({
  productId: idField,
  warehouseId: idField.optional(),
});

// ------------------------------------------------------------
// التوالف والزيادات
// ------------------------------------------------------------
const adjustmentFields = {
  warehouseId: idField,
  date: z.string().refine(isDay, "InvalidDate").optional(),
  notes: optionalText(255),
  items: z
    .array(
      z.object({
        productId: idField,
        unitId: idField,
        qty: qtyField,
        reason: optionalText(255),
        // التالف: القطع المختارة من اللي في المحل
        serialIds: z.array(idField).max(1000).default([]),
        // الزيادة: أرقام جديدة (اختياري)
        serials: z
          .array(
            z.object({
              serial: z.string().trim().min(1).max(100),
              serial2: z.string().trim().max(100).nullish(),
              isUsed: z.boolean().default(false),
            }),
          )
          .max(1000)
          .default([]),
      }),
    )
    .min(1, "NoItems")
    .max(500),
};

// التالف لازم سببه يتكتب لكل صنف
const damageReasons = (d, ctx) => {
  if (d.type !== "damage") return;
  d.items.forEach((it, i) => {
    if (!it.reason)
      ctx.addIssue({
        code: "custom",
        path: ["items", i, "reason"],
        message: "DamageReasonRequired",
      });
  });
};

export const createAdjustmentSchema = z
  .object({ ...adjustmentFields, type: z.enum(["damage", "surplus"]) })
  .superRefine(damageReasons);

// التعديل: النوع ثابت (بيتبعت عشان التحقق من السبب بس)
export const updateAdjustmentSchema = z
  .object({
    ...adjustmentFields,
    id: idField,
    type: z.enum(["damage", "surplus"]),
  })
  .superRefine(damageReasons);

export const adjustmentListSchema = z.object({
  type: z.enum(["damage", "surplus"]).optional(),
  q: z.string().trim().max(50).default(""),
  page: pageField,
});

// حركة المخزون الشاملة (شاشة الأرصدة)
export const stockMovementReportSchema = z.object({
  warehouseId: idField.optional(),
  q: z.string().trim().max(100).default(""),
  categoryId: idField.optional(),
  from: z.string().refine(isDay, "InvalidDate").optional(),
  to: z.string().refine(isDay, "InvalidDate").optional(),
  hideIdle: z.boolean().default(false),
  page: pageField,
  all: z.boolean().default(false),
});
