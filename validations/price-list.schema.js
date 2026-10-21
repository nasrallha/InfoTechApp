import { z } from "zod";
import { nameField, idField, idsField, optionalText } from "./common.schema";

const priceListFields = {
  arName: nameField(100),
  enName: nameField(100),
  isActive: z.boolean().default(true),
  notes: optionalText(255),
};

export const createPriceListSchema = z.object(priceListFields);
export const updatePriceListSchema = z.object({
  ...priceListFields,
  id: idField,
});
export const deletePriceListsSchema = idsField;

// أصناف القائمة (تصفح + بحث + قسم)
export const priceListProductsSchema = z.object({
  priceListId: idField,
  q: z.string().trim().max(100).default(""),
  categoryId: idField.optional(),
  page: z.number().int().min(1).max(10_000).default(1),
});

// حفظ أسعار: price = null ← حذف سعر الصنف من القائمة (يرجع للسعر الأساسي)
export const savePricesSchema = z.object({
  priceListId: idField,
  prices: z
    .array(
      z.object({
        productId: idField,
        unitId: idField,
        price: z
          .number()
          .min(0, "MustBePositive")
          .max(1_000_000_000, "ValueOutOfRange")
          .nullable(),
      }),
    )
    .min(1, "RequiredField")
    .max(2000),
});
