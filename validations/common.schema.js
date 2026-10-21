import { z } from "zod";
import { IMAGE_TYPES, MAX_IMAGE_SIZE } from "@/lib/image";

// قواعد مشتركة نستخدمها في كل الأقسام (أقسام، وحدات، منتجات، عملاء ...)
// الرسائل = مفاتيح ترجمة من messages (قسم Alerts)

// اسم عربي/إنجليزي: من 3 إلى max حرف
export const nameField = (max = 50) =>
  z
    .string({ error: "RequiredField" })
    .trim()
    .min(1, "RequiredField")
    .min(3, "MinCharcters")
    .max(max, max === 50 ? "MaxCharacters" : "TextTooLong");

// رقم سجل (id) موجب صحيح
export const idField = z.number({ error: "RequiredField" }).int().positive();

// بصمة الحفظ (idempotency): UUID ثابت لكل محاولة حفظ من الشاشة
export const requestIdField = z.uuid().nullish();

// قائمة أرقام للحذف (رقم واحد على الأقل)
export const idsField = z.array(idField).min(1, "RequiredField");

// مبلغ مالي: رقم صفر أو أكبر
export const moneyField = z
  .number({ error: "RequiredField" })
  .min(0, "MustBePositive");

// الصورة اختيارية: ملف (File) بنوع وحجم مسموح، أو null
export const imageField = z
  .instanceof(File)
  .refine((file) => IMAGE_TYPES.includes(file.type), "AllowedImageTypes")
  .refine((file) => file.size <= MAX_IMAGE_SIZE, "ImageTooLarge")
  .nullish()
  .transform((v) => v ?? null);

// حقل اختياري من أرقام فقط بطول معيّن
// النص الفاضي يصبح null (حتى لا يتعارض مع @unique في قاعدة البيانات)
export const optionalDigits = (pattern, errorCode) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .regex(pattern, errorCode)
      .nullish()
      .transform((v) => v ?? null),
  );

// نص اختياري (للعنوان): النص الفاضي يصبح null
export const optionalText = (max) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .max(max, "TextTooLong")
      .nullish()
      .transform((v) => v ?? null),
  );

// العنوان الوطني (كل حقوله اختيارية): نستخدمه في العملاء والموردين وبيانات الشركة
export const nationalAddressFields = {
  city: optionalText(100),
  district: optionalText(100),
  street: optionalText(100),
  buildingNo: optionalDigits(/^\d{4}$/, "BuildingNoInvalid"),
  additionalNo: optionalDigits(/^\d{4}$/, "AdditionalNoInvalid"),
  postalCode: optionalDigits(/^\d{5}$/, "PostalCodeInvalid"),
};
