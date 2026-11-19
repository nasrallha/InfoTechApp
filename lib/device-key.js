import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

// ============================================================
// رقم الجهاز (إعدادات الطباعة لكل جهاز): كوكي على الجهاز نفسه
// - القراءة: أي صفحة / action (من غير كوكي = null ← إعدادات الشركة)
// - الإنشاء: وقت حفظ إعدادات الجهاز بس (server action)
// ============================================================
const DEVICE_COOKIE = "print-device";
const KEY_RE = /^[0-9a-f-]{36}$/;
const TEN_YEARS = 10 * 365 * 24 * 60 * 60;

export async function getDeviceKey() {
  try {
    const v = (await cookies()).get(DEVICE_COOKIE)?.value;
    return v && KEY_RE.test(v) ? v : null;
  } catch {
    // برّه طلب
    return null;
  }
}

// رقم الجهاز (ولو مفيش: رقم جديد بيتحفظ على الجهاز)
export async function ensureDeviceKey() {
  const current = await getDeviceKey();
  if (current) return current;
  const key = randomUUID();
  (await cookies()).set(DEVICE_COOKIE, key, {
    path: "/",
    maxAge: TEN_YEARS,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production",
  });
  return key;
}
