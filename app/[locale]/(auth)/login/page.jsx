// صفحة تسجيل الدخول: خارج (dashboard)، فلا تظهر فيها القائمة الجانبية ولا الهيدر
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth";
import { hasAnyUser } from "@/services/auth.service";
import { getActiveCurrencies } from "@/services/currency.service";
import LoginScreen from "@/components/auth/LoginScreen";
import FullPageLoader from "@/components/common/FullPageLoader";
import DbErrorScreen from "@/components/common/DbErrorScreen";
import { withDb } from "@/lib/db-guard";
import {
  companyBranding,
  currentCompany,
  multiTenant,
  panelImageUrl,
} from "@/lib/tenant";
import { getSubscription, isBlocked } from "@/lib/subscription";
import { getVendor } from "@/lib/vendor";
import { getCompanyNames } from "@/services/company.service";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth" });
  return { title: t("LoginTitle") };
}

// ------------------------------------------------------------
// وضع الشركات: الشركة من الجهاز (cookie)، أو العميل يكتب كودها
// ------------------------------------------------------------
async function TenantLogin() {
  let company = null;
  let unavailable = false;
  try {
    company = await currentCompany();
  } catch (e) {
    // لوحة التحكم مش بترد (وده أول مرة الكود ده يتفتح على السيرفر)
    console.error("[tenant] panel lookup failed:", e?.message);
    unavailable = true;
  }
  if (!company?.provisioned)
    return (
      <LoginScreen
        multi
        company={null}
        panelUnavailable={unavailable}
        vendor={await getVendor().catch(() => null)}
      />
    );

  const { data, dbError } = await withDb(async () => {
    const user = await getCurrentUser();
    if (user) return { loggedIn: true };
    const [sub, names] = await Promise.all([
      getSubscription(),
      // الاسم والصورة من قاعدة الشركة (اللوحة بتكتبهم فيها أول ما يتعدّلوا)،
      // مش من بيانات الشركة المحفوظة على السيرفر من أول مرة
      getCompanyNames().catch(() => null),
    ]);
    return {
      blocked: isBlocked(sub) ? sub.state : null,
      reason: sub?.suspendReason ?? null,
      vendor: await getVendor(),
      names,
      // صورة شاشة الدخول: اللوحة بتكتبها في الاشتراك مع كل مزامنة
      // (القاعدة لسه متحدّثتش: مفيش العمود ← الصورة المحفوظة على السيرفر)
      image:
        sub && "loginImage" in sub ? { url: panelImageUrl(sub.loginImage) } : null,
    };
  });
  if (dbError) return <DbErrorScreen {...dbError} />;
  if (data.loggedIn) redirect({ href: "/", locale: await getLocale() });

  return (
    <LoginScreen
      multi
      company={{
        ...companyBranding(company),
        ...(data.names?.arName ? { arName: data.names.arName } : {}),
        ...(data.names?.enName ? { enName: data.names.enName } : {}),
        ...(data.image ? { image: data.image.url } : {}),
      }}
      blocked={data.blocked}
      blockedReason={data.reason}
      vendor={data.vendor}
    />
  );
}

async function LoginContent() {
  if (multiTenant()) return <TenantLogin />;

  // قاعدة البيانات لا تعمل ← شاشة واضحة بالمشكلة والحل
  const { data, dbError } = await withDb(async () => {
    const user = await getCurrentUser();
    if (user) return { loggedIn: true };

    // لا يوجد أي مستخدم في النظام ← نعرض شاشة إنشاء مدير النظام
    const needsSetup = !(await hasAnyUser());
    // في الإعداد الأول: يختار العملة الأساسية للبرنامج
    const currencies = needsSetup ? await getActiveCurrencies() : [];
    return { needsSetup, currencies };
  });
  if (dbError) return <DbErrorScreen {...dbError} />;

  // مسجل دخول بالفعل ← الصفحة الرئيسية
  if (data.loggedIn) redirect({ href: "/", locale: await getLocale() });

  return (
    <LoginScreen needsSetup={data.needsSetup} currencies={data.currencies} />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <LoginContent />
    </Suspense>
  );
}
