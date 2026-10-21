import "server-only";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// تشفير كلمات المرور باستخدام scrypt (موجود في Node نفسه، لا يحتاج مكتبة)
// الشكل المحفوظ في قاعدة البيانات: scrypt$<salt>$<hash>
// - salt عشوائي لكل مستخدم: كلمتا مرور متشابهتان لا يظهر لهما نفس الـ hash
// - لا يمكن استرجاع كلمة المرور الأصلية من الـ hash، فقط التحقق منها

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [algorithm, salt, hashHex] = String(stored ?? "").split("$");
  if (algorithm !== "scrypt" || !salt || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, salt, expected.length);

  // مقارنة بزمن ثابت حتى لا يُستنتج شيء من سرعة الرد
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// hash وهمي: نتحقق منه عندما يكون اسم المستخدم غير موجود
// حتى يأخذ الرد نفس الوقت تقريباً (فلا يُعرف هل الاسم موجود أم لا)
export const DUMMY_HASH = "scrypt$00000000000000000000000000000000$" + "0".repeat(KEY_LENGTH * 2);
