import { z } from "zod";
import { nameField, idField, idsField, imageField } from "./common.schema";
import { usernameField, passwordField } from "./auth.schema";

const userFields = {
  arFullname: nameField(100),
  enFullname: nameField(100),
  username: usernameField,
  roleId: idField,
  // الفرع الأساسي (لغير مدير النظام يُفرض فرعه الحالي في الـ service)
  branchId: idField,
  isActive: z.boolean().default(true),
  // الصورة اختيارية (لو موجودة تظهر بدل الأفاتار)
  image: imageField,
};

// الإضافة: كلمة المرور إجبارية
export const createUserSchema = z.object({
  ...userFields,
  password: passwordField,
});

// التعديل: كلمة المرور اختيارية (فارغة = لا تتغير)
export const updateUserSchema = z.object({
  ...userFields,
  id: idField,
  password: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    passwordField.optional(),
  ),
  // true = حذف الصورة الحالية بدون اختيار صورة جديدة
  removeImage: z.boolean().default(false),
});

export const deleteUsersSchema = idsField;

// صلاحيات المستخدم (النهائية) من شاشة صلاحيات المستخدم
export const userPermissionsSchema = z.object({
  userId: idField,
  permissions: z.array(z.string().max(80)).max(1000),
});
