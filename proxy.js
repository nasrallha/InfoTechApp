// Next.js 16: اسم middleware أصبح proxy
// 1) next-intl: إضافة اللغة للرابط (/ ← /en)
// 2) فحص سريع: لا توجد cookie جلسة ← نحوله لصفحة الدخول
//    (هذا فحص للسرعة فقط، الفحص الحقيقي يتم في السيرفر مع كل صفحة و action)
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { SESSION_COOKIE, TENANT_COOKIE } from "./lib/session-config";
import { readAppLocale } from "./lib/app-locale";

// اللغة الافتراضية من الإعدادات العامة (lib/app-locale) بدل الثابتة في الكود
// وضع الشركات: من إعدادات الشركة اللي على الجهاز (cookie الشركة)
// (نسخة من next-intl لكل اختيار، بتتعمل مرة واحدة)
const handlers = new Map();
function i18nHandler(request) {
  const code = request.cookies.get(TENANT_COOKIE)?.value;
  const { defaultLocale, localeDetection } = readAppLocale(
    /^[A-Z2-9]{8}$/.test(code ?? "") ? code : null,
  );
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
// + لينك الحجز للعملاء (/book/<كود الشركة>) + الطلب الأونلاين (/order/<كود الشركة>)
const PUBLIC_PAGES = ["/login", "/book", "/order"];

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

  return i18nHandler(request)(request);
}

export const config = {
  matcher: ["/", "/(ar|en)/:path*"],
};
