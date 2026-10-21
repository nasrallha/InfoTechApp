import { z } from "zod";
import { idField, idsField } from "./common.schema";

// أنواع طرق الدفع (نستخدمها في الواجهة أيضاً)
// cash نقدي / card بطاقة / wallet محفظة / transfer تحويل / credit آجل
export const PAYMENT_TYPES = ["cash", "card", "wallet", "transfer", "credit"];

const paymentMethodFields = {
  arName: z
    .string({ error: "RequiredField" })
    .trim()
    .min(2, "RequiredField")
    .max(50, "TextTooLong"),
  enName: z
    .string({ error: "RequiredField" })
    .trim()
    .min(2, "RequiredField")
    .max(50, "TextTooLong"),
  type: z.enum(PAYMENT_TYPES, "ValidationError"),
  requiresReference: z.boolean().default(false),
  sortOrder: z
    .number({ error: "RequiredField" })
    .int("MustBeInteger")
    .min(0, "ValueOutOfRange")
    .max(999, "ValueOutOfRange"),
  isActive: z.boolean().default(true),
};

export const createPaymentMethodSchema = z.object(paymentMethodFields);
export const updatePaymentMethodSchema = z.object({
  ...paymentMethodFields,
  id: idField,
});
export const deletePaymentMethodsSchema = idsField;
