import { Suspense } from "react";
import MainLayout from "@/components/layout/MainLayout";
import FullPageLoader from "@/components/common/FullPageLoader";
import { AuthProvider } from "@/components/auth/AuthProvider";
import IdleGuard from "@/components/auth/IdleGuard";
import { getSecuritySettings } from "@/lib/security-settings";
import { requireUser } from "@/lib/auth";
import { getSwitchableBranches } from "@/services/auth.service";
import { getBaseCurrency } from "@/services/currency.service";
import { CurrencyProvider } from "@/components/common/CurrencyProvider";
import { getCompany } from "@/services/company.service";
import { CompanyProvider } from "@/components/common/CompanyProvider";
import DbErrorScreen from "@/components/common/DbErrorScreen";
import { withDb } from "@/lib/db-guard";
import { getVendor } from "@/lib/vendor";
import { getSubscription } from "@/lib/subscription";

// كل الصفحات داخل (dashboard) تظهر داخل القائمة الجانبية والهيدر تلقائياً
// وكلها تحتاج تسجيل دخول (غير المسجل يتحول لصفحة الدخول)
export default function DashboardLayout({ children }) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}

// يقرأ المستخدم الحالي من الجلسة (يحتاج طلباً حقيقياً، لذلك داخل Suspense)
async function AuthenticatedShell({ children }) {
  // قاعدة البيانات لا تعمل ← شاشة واضحة بالمشكلة والحل بدل الخطأ التقني
  const { data, dbError } = await withDb(async () => {
    const user = await requireUser();

    // مدير النظام: قائمة الفروع ليتنقل بينها من الهيدر
    // + العملة الأساسية للنظام (تظهر في الملصقات والفواتير)
    const [branches, currency, company, security, vendor, sub] =
      await Promise.all([
        getSwitchableBranches(user),
        getBaseCurrency(),
        getCompany(),
        getSecuritySettings(),
        getVendor(),
        getSubscription(),
      ]);
    return {
      user,
      branches,
      currency,
      company,
      idleMinutes: security.idleMinutes,
      vendor,
      // للتنبيه بس (من غير باقي بيانات الاشتراك)
      subscription: sub
        ? {
            state: sub.state,
            daysLeft: sub.daysLeft ?? null,
            endsAt: sub.endsAt ?? null,
            graceEndsAt: sub.graceEndsAt ?? null,
            readonlyEndsAt: sub.readonlyEndsAt ?? null,
          }
        : null,
    };
  });
  if (dbError) return <DbErrorScreen {...dbError} />;

  const { user, branches, currency, company, idleMinutes, vendor, subscription } =
    data;

  // لا نرسل للمتصفح إلا ما تحتاجه الواجهة
  const clientUser = { ...user };
  delete clientUser.sessionId;

  return (
    <AuthProvider user={clientUser}>
      {/* آخر نشاط + الخروج بعد عدم نشاط (إعدادات الدخول) */}
      <IdleGuard idleMinutes={idleMinutes} />
      <CurrencyProvider currency={currency}>
        <CompanyProvider company={company}>
          <MainLayout
            branches={branches}
            vendor={vendor}
            subscription={subscription}
          >
            {children}
          </MainLayout>
        </CompanyProvider>
      </CurrencyProvider>
    </AuthProvider>
  );
}
