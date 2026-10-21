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
