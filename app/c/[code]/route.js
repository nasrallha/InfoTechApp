// ============================================================
// لينك الشركة: /c/<الكود>
// الجهاز يفتكر الشركة (cookie) ← شاشة الدخول وعليها اسم الشركة
// لو الجهاز كان على شركة تانية: بيخرج منها الأول
// ============================================================
import { NextResponse } from "next/server";
import {
  TENANT_COOKIE,
  companyCookieOptions,
  multiTenant,
  normalizeCode,
  resolveCompany,
} from "@/lib/tenant";
import { SESSION_COOKIE } from "@/lib/session-config";
import { hasCompanyLocale, readAppLocale } from "@/lib/app-locale";
import { publicUrl } from "@/lib/public-url";

export async function GET(request, { params }) {
  const { code: raw } = await params;
  const { defaultLocale } = readAppLocale();
  // الدومين الحقيقي (ورا Caddy) مش localhost
  const login = publicUrl(`/${defaultLocale}/login`, request);

  if (!multiTenant()) return NextResponse.redirect(login);

  const code = normalizeCode(raw);
  let company = null;
  try {
    company = code ? await resolveCompany(code) : null;
  } catch (e) {
    console.error("[tenant] panel lookup failed:", e?.message);
    login.searchParams.set("company", "unavailable");
    return NextResponse.redirect(login);
  }
  if (!company) {
    login.searchParams.set("company", "notfound");
    return NextResponse.redirect(login);
  }

  // لغة الشركة (من إعداداتها): أول مرة على السيرفر نعمل ملفها
  if (company.provisioned && !hasCompanyLocale(company.code)) {
    try {
      const { runWithCompany } = await import("@/lib/tenant");
      const { syncAppLocale } = await import(
        "@/services/system-settings.service"
      );
      await runWithCompany(company.code, () => syncAppLocale());
    } catch (e) {
      console.error("[locale] company sync failed:", e?.message ?? e);
    }
  }
  const { defaultLocale: companyLocale } = readAppLocale(company.code);
  login.pathname = `/${companyLocale}/login`;

  const res = NextResponse.redirect(login);
  if (request.cookies.get(TENANT_COOKIE)?.value !== company.code)
    res.cookies.delete(SESSION_COOKIE);
  res.cookies.set(TENANT_COOKIE, company.code, companyCookieOptions());
  return res;
}
