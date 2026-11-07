import { z } from "zod";
import { idField, moneyField } from "./common.schema";

// المقاسات والألوان (وحدة variants)
const textList = (max) =>
  z.array(z.string().trim().max(30)).max(max).default([]);

export const generateVariantsSchema = z.object({
  productId: idField,
  sizes: textList(60),
  // الألوان اختيارية: الاسم + لون الدايرة (#RRGGBB)
  colors: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(30),
        hex: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullish(),
      }),
    )
    .max(20)
    .default([]),
  // الرصيد الافتتاحي: { "المقاس|اللون": كمية }
  opening: z.record(z.string().max(70), z.number().min(0)).default({}),
});

export const modelPriceSchema = z.object({
  modelId: idField,
  price: moneyField,
});
