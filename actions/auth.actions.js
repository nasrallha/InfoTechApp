"use server";

// تسجيل الدخول والخروج وتغيير الفرع
// الدخول وإعداد النظام public: لا يحتاجان جلسة (لأن المستخدم لم يدخل بعد)

import { runAction } from "@/lib/action";
import { loginSchema, setupSchema, switchBranchSchema } from "@/validations/auth.schema";
import { login, setupFirstAdmin, logout, switchBranch } from "@/services/auth.service";
import { AppError } from "@/lib/errors";
import {
  clearCompanyCookies,
  currentCompanyCode,
  multiTenant,
  normalizeCode,
  resolveCompany,
  runWithCompany,
  setCompanyCookie,
} from "@/lib/tenant";

export async function loginAction(input) {
  return runAction(
    loginSchema,
    input,
    async ({ companyCode, ...data }) => {
      if (!multiTenant()) return login(data);
      // الشركة: الكود المكتوب، أو اللي الجهاز فاكره
      const code = companyCode
        ? normalizeCode(companyCode)
        : await currentCompanyCode();
      if (!code)
        throw new AppError(
          companyCode ? "CompanyNotFound" : "CompanyCodeRequired",
          null,
          { companyCode: companyCode ? "CompanyNotFound" : "CompanyCodeRequired" },
        );
      const company = await resolveCompany(code);
      if (!company)
        throw new AppError("CompanyNotFound", null, {
          companyCode: "CompanyNotFound",
        });
      if (!company.provisioned) throw new AppError("CompanyNotReady");
      await runWithCompany(code, async () => {
        await login(data);
        // لغة الشركة للـ proxy (لو ملفها لسه متعملش على السيرفر)
        const { hasCompanyLocale } = await import("@/lib/app-locale");
        if (!hasCompanyLocale(code)) {
          const { syncAppLocale } = await import(
            "@/services/system-settings.service"
          );
          await syncAppLocale().catch(() => {});
        }
      });
      // الجهاز يفتكر الشركة
      await setCompanyCookie(code);
    },
    { public: true },
  );
}

// "شركة تانية؟": الجهاز ينسى الشركة (ويخرج لو كان داخل)
export async function clearCompanyAction() {
  return runAction(
    null,
    null,
    async () => {
      try {
        await logout();
      } catch {
        // مفيش جلسة
      }
      await clearCompanyCookies();
    },
    { public: true },
  );
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
