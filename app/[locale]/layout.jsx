import { Suspense } from "react";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { routing } from "@/i18n/routing";
// خط البرنامج: IBM Plex Sans Arabic (نفس خط لوحة التحكم - عربي وإنجليزي وأرقام)
// متسطّب جوه البرنامج (@fontsource/ibm-plex-sans-arabic) ← مش محتاج نت
// (Google Fonts كان بيفشل من غير إنترنت ويستخدم خط بديل)
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import SilenceDevWarnings from "@/components/common/SilenceDevWarnings";
import AntdProvider from "@/components/common/AntdProvider";
import ConnectionStatus from "@/components/common/ConnectionStatus";
import { themeCssVars } from "@/lib/theme";
import "../globals.css";

// عنوان التبويب في المتصفح = اسم الشركة نفسها (المطعم / المحل) من أول ما الصفحة تفتح
// (مش اسم الشركة المنفذة)، ولو لسه مفيش شركة أو القاعدة واقفة: اسم البرنامج
async function companyTitle(locale) {
  const pick = (c) =>
    c ? (locale === "ar" ? c.arName || c.enName : c.enName || c.arName) : null;
  try {
    const { getCompany } = await import("@/services/company.service");
    const name = pick(await getCompany());
    if (name) return name;
  } catch {
    // القاعدة واقفة / لسه مفيش شركة مختارة (شاشة الدخول)
  }
  try {
    const { currentCompany } = await import("@/lib/tenant");
    return pick(await currentCompany());
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth" });
  // اسم الشركة بيتقري وقت الطلب (مش وقت البناء)
  await connection();
  const name = await companyTitle(locale);
  return { title: name || t("AppName"), description: t("Tagline") };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({ children, params }) {
  const { locale } = await params;

  if (!routing.locales.includes(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      data-theme="light"
      style={{ "--font-main": "'IBM Plex Sans Arabic'" }}
    >
      <head>
        {/* ألوان البرنامج كمتغيرات CSS (--c-primary ...) من lib/theme.js */}
        <style dangerouslySetInnerHTML={{ __html: themeCssVars }} />
      </head>
      <body className="min-h-screen" suppressHydrationWarning>
        {/* إخفاء تحذير antd غير الضار عند التنقل بين الصفحات (وضع التطوير فقط) */}
        <SilenceDevWarnings />
        <NextIntlClientProvider messages={messages}>
          <Suspense fallback={null}>
            <AntdRegistry>
              {/* الاتجاه واللغة والألوان والأحجام لكل مكونات antd */}
              <AntdProvider locale={locale}>
                {children}
                {/* شاشة "مفيش إنترنت / مشكلة في السيرفر" */}
                <ConnectionStatus />
              </AntdProvider>
            </AntdRegistry>
          </Suspense>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
