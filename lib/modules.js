import "server-only";
import { getSubscription } from "./subscription";
import { AppError } from "./errors";

// ============================================================
// الوحدات المفعّلة للشركة الحالية
// - وضع الشركات: من نسخة الاشتراك (اللوحة بتكتبها حسب النشاط + استثناءات الشركة)
// - وضع القاعدة الواحدة: من ERP_MODULES (اختياري، مفصولة بفواصل)
// - غير كده: مفيش وحدات (البرنامج الأساسي بس)
// ============================================================
export async function enabledModules() {
  const sub = await getSubscription();
  if (sub) return Array.isArray(sub.modules) ? sub.modules : [];
  return (process.env.ERP_MODULES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function hasModule(key) {
  return (await enabledModules()).includes(key);
}

// للخدمات: العملية تخص وحدة مقفولة
export async function assertModule(key) {
  if (!(await hasModule(key))) throw new AppError("ModuleDisabled");
}
