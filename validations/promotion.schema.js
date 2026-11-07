import { z } from "zod";
import { idField, nameField, optionalText } from "./common.schema";
import { isDay } from "@/lib/dates";

const dayField = z
  .string({ error: "RequiredField" })
  .refine(isDay, "InvalidDate");

// عرض / خصم لفترة
export const promotionSchema = z.object({
  id: idField.optional(),
  arName: nameField(150),
  enName: z.string().trim().max(150, "TextTooLong").optional().default(""),
  scope: z.enum(["invoice", "category", "product", "loyalty"]),
  // عرض الولاء: كل كام مرة مدفوعة + على إيه (كل الخدمات / أقسام / أصناف)
  loyaltyEvery: z.number().int().min(1, "MustBePositive").max(1000).nullish(),
  loyaltyTarget: z.enum(["service", "category", "product"]).nullish(),
  discountType: z.enum(["percent", "amount", "fixedPrice"]),
  value: z
    .number({ error: "RequiredField" })
    .positive("MustBePositive")
    .max(1_000_000, "ValueOutOfRange"),
  minInvoice: z
    .number()
    .min(0, "MustBePositive")
    .max(1_000_000_000, "ValueOutOfRange")
    .nullish(),
  startDate: dayField,
  endDate: dayField,
  isActive: z.boolean().default(true),
  allBranches: z.boolean().default(true),
  branchIds: z.array(idField).max(200).default([]),
  categoryIds: z.array(idField).max(500).default([]),
  productIds: z.array(idField).max(5000).default([]),
  notes: optionalText(500),
});

export const togglePromotionSchema = z.object({
  id: idField,
  isActive: z.boolean(),
});
