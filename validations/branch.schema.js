import { z } from "zod";
import {
  nameField,
  idField,
  idsField,
  optionalDigits,
  optionalText,
  nationalAddressFields,
} from "./common.schema";

// رقم اختياري (مستودع / قائمة أسعار): فاضي ← null
const optionalId = z
  .number()
  .int()
  .positive()
  .nullish()
  .transform((v) => v ?? null);

// بيانات إضافة فرع
export const createBranchSchema = z.object({
  arName: nameField(100),
  enName: nameField(100),
  address: z
    .string({ error: "RequiredField" })
    .trim()
    .min(1, "RequiredField")
    .max(255, "TextTooLong"),
  isActive: z.boolean().default(true),
  // بيانات الفاتورة (لو فاضية تُؤخذ من بيانات الشركة)
  phone: optionalText(20),
  registrationNo: optionalDigits(/^\d{10}$/, "RegistrationNoInvalid"),
  ...nationalAddressFields,
  // المستودع وقائمة الأسعار
  warehouseId: optionalId,
  priceListId: optionalId,
});

// بيانات تعديل فرع = بيانات الإضافة + رقم الفرع
export const updateBranchSchema = createBranchSchema.extend({
  id: idField,
});

// حذف فرع أو أكثر
export const deleteBranchesSchema = idsField;
