import { z } from "zod";
import { SELLER_ID_SCHEMES, idValid } from "@/lib/zatca-tax";
import {
  nameField,
  idField,
  idsField,
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

// معرّف الفرع: الرقم لازم يطابق نوعه (سجل تجاري 10 أرقام، الموحد يبدأ بـ 7...)
const checkBranchId = (b, ctx) => {
  if (b.registrationNo && !idValid(b.idScheme ?? "CRN", b.registrationNo))
    ctx.addIssue({
      code: "custom",
      path: ["registrationNo"],
      message: (b.idScheme ?? "CRN") === "CRN" ? "RegistrationNoInvalid" : "IdNumberInvalid",
    });
};

// بيانات إضافة فرع
const branchFields = z.object({
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
  // معرّف الفرع: النوع + الرقم (فاضي = معرّف الشركة)
  idScheme: z.enum(SELLER_ID_SCHEMES, "ValidationError").default("CRN"),
  registrationNo: optionalText(30),
  ...nationalAddressFields,
  // المستودع وقائمة الأسعار
  warehouseId: optionalId,
  priceListId: optionalId,
  // مستودع جديد باسم الفرع (بيتعمل ويتربط بالفرع في نفس الحفظ)
  newWarehouse: z.boolean().default(false),
});

export const createBranchSchema = branchFields.superRefine(checkBranchId);

// بيانات تعديل فرع = بيانات الإضافة + رقم الفرع
export const updateBranchSchema = branchFields
  .extend({ id: idField })
  .superRefine(checkBranchId);

// حذف فرع أو أكثر
export const deleteBranchesSchema = idsField;
