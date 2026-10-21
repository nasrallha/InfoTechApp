import { z } from "zod";
import { nameField, idField } from "./common.schema";

// اسم المستخدم: حروف إنجليزية صغيرة وأرقام و . _ - فقط (بدون مسافات)
// نحوله لحروف صغيرة حتى لا يكون Ahmed و ahmed مستخدمين مختلفين
export const usernameField = z
  .string({ error: "RequiredField" })
  .trim()
  .toLowerCase()
  .min(3, "UsernameMin")
  .max(50, "TextTooLong")
  .regex(/^[a-z0-9._-]+$/, "UsernameInvalid");

// كلمة المرور: 6 أحرف على الأقل
export const passwordField = z
  .string({ error: "RequiredField" })
  .min(6, "PasswordMin")
  .max(100, "TextTooLong");

// تسجيل الدخول: لا نتحقق من الشكل هنا، فقط أنها ليست فارغة
// (لو الشكل خطأ فالدخول سيفشل برسالة "بيانات الدخول غير صحيحة")
export const loginSchema = z.object({
  username: z.string({ error: "RequiredField" }).trim().toLowerCase().min(1, "RequiredField"),
  password: z.string({ error: "RequiredField" }).min(1, "RequiredField"),
});

// إعداد النظام لأول مرة: إنشاء مدير النظام
export const setupSchema = z.object({
  arFullname: nameField(100),
  enFullname: nameField(100),
  username: usernameField,
  password: passwordField,
  // العملة الأساسية للبرنامج (اختيارية: لو لم تُرسل تبقى الافتراضية)
  currencyId: idField.optional(),
});

// تغيير الفرع الحالي (لمدير النظام)
export const switchBranchSchema = idField;
