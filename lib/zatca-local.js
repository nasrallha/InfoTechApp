import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ============================================================
// مفاتيح الربط مع الزكاة المحلية (من غير أي إعداد يدوي)
// - لو المفتاح متحدد في .env بيتاخد منه
// - غير كده بيتعمل تلقائياً أول مرة ويتحفظ في فولدر .zatca جنب المشروع
//   (gateway.key = المفتاح المشترك مع خدمة الـ SDK،
//    master.key  = مفتاح تشفير الشهادات والأسرار في قاعدة البيانات)
// ⚠ خد نسخة احتياطية من فولدر .zatca مع نسخة قاعدة البيانات
// ============================================================

export const ZATCA_DIR = path.join(process.cwd(), ".zatca");

function readOrCreate(file, size) {
  const full = path.join(ZATCA_DIR, file);
  try {
    const value = fs.readFileSync(full, "utf8").trim();
    if (value) return { value, created: false };
  } catch {
    // الملف مش موجود: نعمله
  }
  const value = crypto.randomBytes(size).toString("base64url");
  fs.mkdirSync(ZATCA_DIR, { recursive: true });
  fs.writeFileSync(full, value, { mode: 0o600 });
  return { value, created: true };
}

// المفتاح المشترك بين المشروع وخدمة ZATCA Gateway
export function getGatewayKey() {
  const env = process.env.ZATCA_GATEWAY_KEY?.trim();
  if (env) return env;
  return readOrCreate("gateway.key", 32).value;
}

// مفتاح التشفير الرئيسي: { value, source: "env" | "file" }
export function getMasterKey() {
  const env = process.env.ZATCA_MASTER_KEY?.trim();
  if (env && env.length >= 32) return { value: env, source: "env" };
  return { value: readOrCreate("master.key", 48).value, source: "file" };
}
