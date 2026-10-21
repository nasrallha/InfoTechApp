"use server";

// البوابة بين واجهة الأدوار والسيرفر
// (الأدوار لا تحتوي ملفات، فنستقبل كائناً عادياً وليس FormData)
// { refresh: true }: بعد النجاح تتحدث صفحة الأدوار تلقائياً
// user: المستخدم الحالي (يرسله runAction) لقواعد مدير النظام

import { runAction } from "@/lib/action";
import {
  createRoleSchema,
  updateRoleSchema,
  deleteRolesSchema,
  setRolePermissionsSchema,
} from "@/validations/role.schema";
import { createRole, updateRole, deleteRoles, setRolePermissions } from "@/services/role.service";

export async function createRoleAction(input) {
  return runAction(createRoleSchema, input, (data, user) => createRole(data, user), {
    permission: "roles.create",
    refresh: true,
  });
}

export async function updateRoleAction(input) {
  return runAction(updateRoleSchema, input, (data, user) => updateRole(data, user), {
    permission: "roles.update",
    refresh: true,
  });
}

export async function deleteRolesAction(ids) {
  return runAction(deleteRolesSchema, ids, (data, user) => deleteRoles(data, user), {
    permission: "roles.delete",
    refresh: true,
  });
}

// حفظ صلاحيات دور (من شاشة الصلاحيات)
export async function setRolePermissionsAction(input) {
  return runAction(
    setRolePermissionsSchema,
    input,
    (data, user) => setRolePermissions(data, user),
    { permission: "roles.permissions", refresh: true },
  );
}
