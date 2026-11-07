import "server-only";
import { AppError } from "./errors";
import { assertModule } from "./modules";
import { getSubscription, isBlocked } from "./subscription";
import { multiTenant, resolveCompany, runWithCompany } from "./tenant";

// ============================================================
// صفحات من غير تسجيل دخول (لينك الحجز): الشركة من الكود اللي في اللينك
// - وضع الشركات: الشركة لازم تكون جاهزة ومش موقوفة
// - الوحدة (module) لازم تكون مفعّلة للشركة
// ============================================================
export function withPublicCompany(code, module, fn) {
  return runWithCompany(code, async () => {
    if (multiTenant()) {
      const company = await resolveCompany(code);
      if (!company?.provisioned) throw new AppError("CompanyNotFound");
      if (isBlocked(await getSubscription()))
        throw new AppError("BookingOnlineOff");
    }
    if (module) await assertModule(module);
    return fn();
  });
}
