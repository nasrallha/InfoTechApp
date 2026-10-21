import { Suspense } from "react";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Cairo } from "next/font/google";
import SilenceDevWarnings from "@/components/common/SilenceDevWarnings";
import AntdProvider from "@/components/common/AntdProvider";
import ConnectionStatus from "@/components/common/ConnectionStatus";
import "../globals.css";

// خط البرنامج: Cairo (واضح للعربي والإنجليزي والأرقام)
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cairo",
  display: "swap",
});

// عنوان التبويب في المتصفح = اسم البرنامج (من ملف الترجمة Auth.AppName)
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth" });
  return { title: t("AppName"), description: t("Tagline") };
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
    <html lang={locale} dir={dir} data-theme="light" className={cairo.variable}>
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
