"use server";

// البوابة بين واجهة المستخدمين والسيرفر
// user: المستخدم الحالي (يرسله runAction) لتطبيق قواعد الفروع ومدير النظام

import { runAction } from "@/lib/action";
import {
  createUserSchema,
  updateUserSchema,
  deleteUsersSchema,
} from "@/validations/user.schema";
import { createUser, updateUser, deleteUsers } from "@/services/user.service";
import { unlockUser } from "@/services/login-security.service";
import { idField } from "@/validations/common.schema";

// الإضافة والتعديل يستقبلان FormData (لأن فيها صورة)
// كل قيم FormData نصوص، فنرجّع كل حقل لنوعه الصحيح قبل التحقق بـ Zod
function readUserForm(formData) {
  const num = (key) => {
    const v = formData.get(key);
    return v === null || v === "" ? undefined : Number(v);
  };
  const image = formData.get("image");

  return {
    ...(formData.get("id") ? { id: num("id") } : {}),
    arFullname: formData.get("arFullname") ?? "",
    enFullname: formData.get("enFullname") ?? "",
    username: formData.get("username") ?? "",
    password: formData.get("password") ?? "",
    roleId: num("roleId"),
    branchId: num("branchId"),
    isActive: formData.get("isActive") === "true",
    // ملف فاضي (بدون اختيار صورة) = لا توجد صورة
    image: image instanceof File && image.size > 0 ? image : null,
    removeImage: formData.get("removeImage") === "true",
  };
}

export async function createUserAction(formData) {
  return runAction(
    createUserSchema,
    readUserForm(formData),
    (data, user) => createUser(data, user),
    {
      permission: "users.create",
      refresh: true,
    },
  );
}

export async function updateUserAction(formData) {
  return runAction(
    updateUserSchema,
    readUserForm(formData),
    (data, user) => updateUser(data, user),
    {
      permission: "users.update",
      refresh: true,
    },
  );
}

export async function deleteUsersAction(ids) {
  return runAction(
    deleteUsersSchema,
    ids,
    (data, user) => deleteUsers(data, user),
    {
      permission: "users.delete",
      refresh: true,
    },
  );
}

// فك قفل مستخدم (اتقفل بسبب محاولات دخول غلط) - للمدير
export async function unlockUserAction(id) {
  return runAction(idField, id, (d, user) => unlockUser(d, user), {
    permission: "loginSecurity.unlock",
    refresh: true,
  });
}
