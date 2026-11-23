import { Suspense } from "react";
import FullPageLoader from "@/components/common/FullPageLoader";
import { AuthProvider } from "@/components/auth/AuthProvider";
import IdleGuard from "@/components/auth/IdleGuard";
import { getSecuritySettings } from "@/lib/security-settings";
import { requireUser } from "@/lib/auth";
import { getBaseCurrency } from "@/services/currency.service";
import { CurrencyProvider } from "@/components/common/CurrencyProvider";
import { getCompany } from "@/services/company.service";
import { CompanyProvider } from "@/components/common/CompanyProvider";
import DbErrorScreen from "@/components/common/DbErrorScreen";
import { withDb } from "@/lib/db-guard";
import { getDevicePrintConfig } from "@/services/invoice-print.service";
import { DevicePrintProvider } from "@/components/printing/DevicePrintProvider";

// شاشة الكاشير: شاشة كاملة بدون القائمة الجانبية والهيدر
// (نفس تسجيل الدخول والعملة مثل باقي البرنامج)
export default function PosLayout({ children }) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }) {
  const { data, dbError } = await withDb(async () => {
    const user = await requireUser();
    const [currency, company, security, devicePrint] = await Promise.all([
      getBaseCurrency(),
      getCompany(),
      getSecuritySettings(),
      // طابعة الإيصالات وفتح الدرج على الجهاز ده
      getDevicePrintConfig(user).catch(() => null),
    ]);
    return { user, currency, company, idleMinutes: security.idleMinutes, devicePrint };
  });
  if (dbError) return <DbErrorScreen {...dbError} />;

  const clientUser = { ...data.user };
  delete clientUser.sessionId;
  return (
    <AuthProvider user={clientUser}>
      <IdleGuard idleMinutes={data.idleMinutes} />
      <CurrencyProvider currency={data.currency}>
        <CompanyProvider company={data.company}>
          <DevicePrintProvider config={data.devicePrint}>{children}</DevicePrintProvider>
        </CompanyProvider>
      </CurrencyProvider>
    </AuthProvider>
  );
}
