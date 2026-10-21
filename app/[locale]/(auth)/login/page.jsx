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

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth" });
  return { title: t("LoginTitle") };
}

async function LoginContent() {
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
