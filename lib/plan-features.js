import "server-only";
import { getSubscription } from "./subscription";

// ============================================================
// مميزات الباقة (وضع الشركات): من نسخة الاشتراك (subscription.features)
// - وضع القاعدة الواحدة، أو شركة من غير باقة: كل حاجة مسموحة
// ============================================================
export async function hasFeature(key) {
  const sub = await getSubscription();
  if (!sub || !Array.isArray(sub.features)) return true;
  return sub.features.includes(key);
}

// حدود الباقة (null = من غير حد)
export async function planLimit(name) {
  const sub = await getSubscription();
  const v = sub?.[name];
  return typeof v === "number" ? v : null;
}

// المدير يقدر يعمل أدوار بنفسه (غير الأدوار الثابتة)؟
export const customRolesAllowed = () => hasFeature("customRoles");
