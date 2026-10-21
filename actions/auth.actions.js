"use server";

// تسجيل الدخول والخروج وتغيير الفرع
// الدخول وإعداد النظام public: لا يحتاجان جلسة (لأن المستخدم لم يدخل بعد)

import { runAction } from "@/lib/action";
import { loginSchema, setupSchema, switchBranchSchema } from "@/validations/auth.schema";
import { login, setupFirstAdmin, logout, switchBranch } from "@/services/auth.service";

export async function loginAction(input) {
  return runAction(loginSchema, input, (data) => login(data), { public: true });
}

export async function setupAction(input) {
  return runAction(setupSchema, input, (data) => setupFirstAdmin(data), { public: true });
}

export async function logoutAction() {
  // public: حتى لو الجلسة انتهت، الخروج يمسح الـ cookie بدون خطأ
  return runAction(null, null, () => logout(), { public: true });
}

// مدير النظام: تغيير الفرع الحالي ثم تحديث الصفحة ببيانات الفرع الجديد
export async function switchBranchAction(branchId) {
  return runAction(switchBranchSchema, branchId, (id, user) => switchBranch(id, user), {
    refresh: true,
  });
}
