"use server";

// البوابة بين شاشة الاستيراد من Excel والسيرفر
// الصلاحية حسب النوع: products.import / customers.import / suppliers.import / units.import / categories.import
// (الصفحة بتتحدث من الواجهة مرة واحدة في الآخر، مش بعد كل دفعة)

import { z } from "zod";
import { runAction } from "@/lib/action";
import { idField } from "@/validations/common.schema";
import { CHECK_CHUNK, IMPORT_KINDS } from "@/lib/import-fields";
import {
  assertImportAllowed,
  importSetup,
  checkProducts,
  runProducts,
  checkParties,
  runParties,
  checkSimple,
  runSimple,
} from "@/services/import.service";

const kindSchema = z.object({ kind: z.enum(IMPORT_KINDS) });

// قيمة الخلية زي ما هي (السيرفر بيحوّلها حسب نوع الحقل)
const cellSchema = z.union([
  z.string().max(1000),
  z.number(),
  z.boolean(),
  z.null(),
]);

// الصفوف: { r: رقم الصف في الملف، v: [[الحقل، القيمة]]، d: الحقول المكررة في الملف }
// (أزواج مش كائن: عشان فحص الجوال العام في runAction ميرفضش الدفعة كلها)
const batchSchema = z.object({
  kind: z.enum(IMPORT_KINDS),
  rows: z
    .array(
      z.object({
        r: z.number().int().min(1),
        v: z.array(z.tuple([z.string().max(40), cellSchema])).max(60),
        d: z.array(z.string().max(40)).max(20).optional(),
      }),
    )
    .min(1)
    .max(CHECK_CHUNK),
  options: z
    .object({
      // الموجود (نفس الكود...) يتحدث، ولا يتساب
      updateExisting: z.boolean().default(true),
      // مستودع الرصيد الافتتاحي للأصناف (فاضي = الرئيسي)
      warehouseId: idField.nullish(),
      // الإتاحة في الفروع للعملاء/الموردين الجداد
      allBranches: z.boolean().optional(),
      branchIds: z.array(idField).max(200).optional(),
    })
    .default({ updateExisting: true }),
});

export async function importSetupAction(input) {
  return runAction(kindSchema, input, async ({ kind }, user) => {
    assertImportAllowed(kind, user);
    return importSetup(kind, user);
  });
}

// فحص من غير حفظ
export async function importCheckAction(input) {
  return runAction(batchSchema, input, async ({ kind, rows, options }, user) => {
    assertImportAllowed(kind, user);
    if (kind === "products") return checkProducts(rows, user, options);
    if (kind === "units" || kind === "categories")
      return checkSimple(kind, rows, user, options);
    return checkParties(kind, rows, user, options);
  });
}

// الحفظ (دفعة من الصفوف)
export async function importRunAction(input) {
  return runAction(batchSchema, input, async ({ kind, rows, options }, user) => {
    assertImportAllowed(kind, user);
    if (kind === "products") return runProducts(rows, user, options);
    if (kind === "units" || kind === "categories")
      return runSimple(kind, rows, user, options);
    return runParties(kind, rows, user, options);
  });
}
