// Next.js 16: اسم middleware أصبح proxy
// 1) next-intl: إضافة اللغة للرابط (/ ← /en)
// 2) فحص سريع: لا توجد cookie جلسة ← نحوله لصفحة الدخول
//    (هذا فحص للسرعة فقط، الفحص الحقيقي يتم في السيرفر مع كل صفحة و action)
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { SESSION_COOKIE } from "./lib/session-config";
import { readAppLocale } from "./lib/app-locale";

// اللغة الافتراضية من الإعدادات العامة (lib/app-locale) بدل الثابتة في الكود
// (نسخة من next-intl لكل اختيار، بتتعمل مرة واحدة)
const handlers = new Map();
function i18nHandler() {
  const { defaultLocale, localeDetection } = readAppLocale();
  const key = `${defaultLocale}:${localeDetection}`;
  if (!handlers.has(key)) {
    handlers.set(
      key,
      createMiddleware({ ...routing, defaultLocale, localeDetection }),
    );
  }
  return handlers.get(key);
}

// الصفحات المفتوحة بدون تسجيل دخول
const PUBLIC_PAGES = ["/login"];

export default function proxy(request) {
  const { pathname } = request.nextUrl;

  // /ar/products ← locale = "ar" , page = "/products"
  const match = pathname.match(/^\/(ar|en)(\/.*)?$/);

  if (match) {
    const [, locale, page = "/"] = match;
    const isPublic = PUBLIC_PAGES.some(
      (p) => page === p || page.startsWith(`${p}/`),
    );
    const hasSession = request.cookies.has(SESSION_COOKIE);

    if (!isPublic && !hasSession) {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }
  }

  return i18nHandler()(request);
}

export const config = {
  matcher: ["/", "/(ar|en)/:path*"],
};
