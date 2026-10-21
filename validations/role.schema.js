import { z } from "zod";
import { nameField, idField, idsField } from "./common.schema";
import { ALL_PERMISSIONS } from "@/lib/permissions";

// بيانات إضافة دور
export const createRoleSchema = z.object({
  arName: nameField(),
  enName: nameField(),
  isActive: z.boolean().default(true),
  // مدير النظام (كل الصلاحيات): لا يغيّره إلا مدير نظام (يُفحص في الـ service)
  isSuper: z.boolean().default(false),
});

// بيانات تعديل دور = بيانات الإضافة + رقم الدور
export const updateRoleSchema = createRoleSchema.extend({
  id: idField,
});

// حذف دور أو أكثر
export const deleteRolesSchema = idsField;

// حفظ صلاحيات دور: كل صلاحية لازم تكون موجودة في lib/permissions.js
export const setRolePermissionsSchema = z.object({
  roleId: idField,
  permissions: z.array(z.enum(ALL_PERMISSIONS, "ValidationError")),
});
