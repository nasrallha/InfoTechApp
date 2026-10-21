import { z } from "zod";
import { SELLER_ID_SCHEMES, idValid } from "@/lib/zatca-tax";
import {
  nameField,
  optionalDigits,
  optionalText,
  nationalAddressFields,
  imageField,
} from "./common.schema";

// بيانات الشركة (تظهر لاحقاً في الفواتير والتقارير)
export const companySchema = z
  .object({
    arName: nameField(255),
    enName: nameField(255),

    // الرقم الضريبي (15 رقم) والسجل التجاري (10 أرقام): اختياريان لكن بالشكل الصحيح
    taxNo: optionalDigits(/^\d{15}$/, "TaxNoInvalid"),
    registrationNo: optionalDigits(/^\d{10}$/, "RegistrationNoInvalid"),

    // معرّف البائع في الفاتورة الإلكترونية: السجل التجاري (CRN) أو رقم تاني
    // (الرقم الموحد 700 / ترخيص بلدي / ...) - الرقم لازم للأنواع غير السجل
    sellerIdScheme: z.enum(SELLER_ID_SCHEMES, "ValidationError").default("CRN"),
    sellerIdNumber: optionalText(30),

    // التواصل (اختياري): الجوال أرقام فقط (ممكن يبدأ بـ +)، والإيميل بالشكل الصحيح
    phone: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z
        .string()
        .trim()
        .regex(/^\+?\d{7,15}$/, "CompanyPhoneInvalid")
        .nullish()
        .transform((v) => v ?? null),
    ),
    email: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z
        .string()
        .trim()
        .toLowerCase()
        .max(100, "TextTooLong")
        .email("EmailInvalid")
        .nullish()
        .transform((v) => v ?? null),
    ),

    // الحساب البنكي (اختياري)
    bankName: optionalText(100),
    bankAccountName: optionalText(150),
    bankAccountNumber: optionalDigits(/^\d{6,30}$/, "BankAccountInvalid"),
    // الآيبان السعودي: SA + 22 رقم (نحذف المسافات ونحول للحروف الكبيرة)
    iban: z.preprocess(
      (v) =>
        typeof v === "string" ? v.replace(/\s+/g, "").toUpperCase() || null : v,
      z
        .string()
        .regex(/^SA\d{22}$/, "IbanInvalid")
        .nullish()
        .transform((v) => v ?? null),
    ),

    // العنوان الوطني
    ...nationalAddressFields,

    // الشعار (اختياري): ملف جديد، أو removeLogo = حذف الحالي
    logo: imageField,
    removeLogo: z.boolean().default(false),
  })
  .superRefine((c, ctx) => {
    if (c.sellerIdScheme !== "CRN") {
      if (!c.sellerIdNumber)
        ctx.addIssue({
          code: "custom",
          path: ["sellerIdNumber"],
          message: "RequiredField",
        });
      else if (!idValid(c.sellerIdScheme, c.sellerIdNumber))
        ctx.addIssue({
          code: "custom",
          path: ["sellerIdNumber"],
          message: "IdNumberInvalid",
        });
    }
  });
