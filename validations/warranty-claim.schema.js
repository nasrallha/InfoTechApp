import { z } from "zod";
import { idField, optionalText } from "./common.schema";
import { isDay } from "@/lib/dates";

// ============================================================
// طلبات الضمان والصيانة
// ============================================================
export const CLAIM_ACCESSORIES = ["charger", "box", "cable", "remote", "bag"];

const money = z
  .number()
  .min(0, "MustBePositive")
  .max(1_000_000_000, "ValueOutOfRange");

const claimFields = {
  kind: z.enum(["warranty", "paid"]).optional(),
  customerName: optionalText(255),
  customerPhone: optionalText(30),
  fault: z
    .string({ error: "RequiredField" })
    .trim()
    .min(2, "RequiredField")
    .max(1000, "TextTooLong"),
  accessories: z.array(z.enum(CLAIM_ACCESSORIES)).max(10).default([]),
  accessoriesOther: optionalText(255),
  condition: optionalText(500),
  expectedAt: z.string().refine(isDay, "InvalidDate").nullish(),
  estimate: money.nullish(),
  notes: optionalText(1000),
};

export const createClaimSchema = z.object({
  ...claimFields,
  // جهاز من عندنا (رقم تسلسلي مسجل) أو صنف أو اسم مكتوب
  serialId: idField.optional(),
  productId: idField.optional(),
  deviceName: optionalText(255),
  serialText: optionalText(100),
  serial2Text: optionalText(100),
  customerId: idField.nullish(),
});

export const updateClaimSchema = z.object({
  ...claimFields,
  id: idField,
  kind: z.enum(["warranty", "paid"]),
});

export const claimStatusSchema = z.object({
  id: idField,
  status: z.enum([
    "inspecting",
    "at_agent",
    "back",
    "ready",
    "delivered",
    "cancelled",
  ]),
  note: optionalText(500),
  supplierId: idField.nullish(),
  agentRef: optionalText(100),
  result: z.enum(["repaired", "replaced", "rejected"]).optional(),
  resultNote: optionalText(500),
  newSerial: optionalText(100),
  newSerial2: optionalText(100),
});

export const claimItemsSchema = z.object({
  id: idField,
  items: z
    .array(
      z.object({
        productId: idField,
        unitId: idField,
        qty: z
          .number({ error: "RequiredField" })
          .positive("MustBePositive")
          .max(1_000_000, "ValueOutOfRange"),
        price: money,
        note: optionalText(500),
      }),
    )
    .max(200),
});

export const claimListSchema = z.object({
  status: z
    .enum([
      "open",
      "all",
      "received",
      "inspecting",
      "at_agent",
      "back",
      "ready",
      "delivered",
      "cancelled",
    ])
    .default("open"),
  q: z.string().trim().max(100).default(""),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(200).default(30),
});
