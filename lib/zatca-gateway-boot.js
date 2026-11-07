import { prisma } from "./prisma";
import { listCompanyCodes, multiTenant, runWithCompany } from "./tenant";
import { ensureGateway } from "./zatca-gateway-launcher";

// ============================================================
// تشغيل خدمة الزكاة مع البرنامج: بس لو فيه فرع مربوط بالزكاة
// - فيه فرع مربوط (وحدة الزكاة active) في أي شركة ← تشتغل على طول
// - مفيش ← ما تشتغلش (البرنامج من غير .NET ومن غير ذاكرة زيادة)
//   ولو حد بدأ الربط من شاشة الزكاة أو اتطلب توقيع: بتقوم لوحدها ساعتها
// - .env: ZATCA_GATEWAY_AUTOSTART=true ← دايماً، =false ← أبداً
// ============================================================
const log = (...args) => console.log("[zatca-gateway]", ...args);

// شركة فيها فرع مربوط؟
const hasActiveUnit = async () =>
  (await prisma.zatcaUnit.count({ where: { status: "active" } })) > 0;

async function anyCompanyLinked() {
  if (!multiTenant()) return hasActiveUnit();
  for (const code of await listCompanyCodes()) {
    try {
      if (await runWithCompany(code, hasActiveUnit)) return true;
    } catch (error) {
      // شركة قاعدتها مش متاحة: نكمل على الباقي
      log(`check (${code}) failed:`, error?.message ?? error);
    }
  }
  return false;
}

export async function bootGateway() {
  const mode = process.env.ZATCA_GATEWAY_AUTOSTART;
  if (mode === "false") return;
  if (mode === "true") return ensureGateway({ wait: false });
  let linked;
  try {
    linked = await anyCompanyLinked();
  } catch (error) {
    // مش عارفين نتأكد (القاعدة مش جاهزة): نشغّلها احتياطي
    log("link check failed, starting anyway:", error?.message ?? error);
    linked = true;
  }
  if (linked) ensureGateway({ wait: false });
  else log("no branch linked to ZATCA: not started (starts on demand)");
}
