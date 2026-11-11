"use server";

// تعديل جماعي للأصناف - الإدارة، بصلاحية productsBulk.run (لمالك البرنامج)
// (الصفحة بتتحدث من الواجهة في الآخر، مش بعد كل دفعة)

import { z } from "zod";
import { runAction } from "@/lib/action";
import { idField } from "@/validations/common.schema";
import {
  applyBulkOpening,
  applyBulkTax,
  countBulkProducts,
} from "@/services/products-bulk.service";

const PERMISSION = "productsBulk.run";

// النطاق: قسم معيّن (فاضي = كل الأصناف) + اللي قيمتها صفر بس
const scope = {
  categoryId: idField.nullish(),
  onlyEmpty: z.boolean().default(false),
};

const countSchema = z.object({
  op: z.enum(["tax", "opening"]),
  ...scope,
  warehouseId: idField.nullish(),
});

const taxSchema = z
  .object({
    ...scope,
    taxRate: z.number().min(0).max(100, "TaxRateInvalid").nullish(),
    includeTax: z.boolean().nullish(),
  })
  .refine((d) => d.taxRate != null || d.includeTax != null, {
    message: "BulkNothingToChange",
    path: ["taxRate"],
  });

const openingSchema = z.object({
  ...scope,
  // المستودع (فاضي = الرئيسي)
  warehouseId: idField.nullish(),
  qty: z
    .number({ error: "RequiredField" })
    .min(0, "MustBePositive")
    .max(1_000_000, "ValueOutOfRange")
    .refine(
      (v) => Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6,
      "QtyDecimals",
    ),
  afterId: z.number().int().min(0).default(0),
});

export async function countBulkProductsAction(input) {
  return runAction(countSchema, input, ({ op, ...s }) => countBulkProducts(op, s), {
    permission: PERMISSION,
  });
}

export async function bulkTaxAction(input) {
  return runAction(taxSchema, input, (d) => applyBulkTax(d), {
    permission: PERMISSION,
  });
}

export async function bulkOpeningAction(input) {
  return runAction(openingSchema, input, (d) => applyBulkOpening(d), {
    permission: PERMISSION,
  });
}
