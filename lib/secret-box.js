import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { AppError } from "@/lib/errors";
import { getMasterKey } from "@/lib/zatca-local";

// ============================================================
// تشفير الأسرار في قاعدة البيانات (المفاتيح الخاصة والـ secrets)
// AES-256-GCM بمفتاح رئيسي:
//   من .env لو موجود (ZATCA_MASTER_KEY = 32 حرف أو أكتر)
//   وإلا بيتعمل تلقائياً في .zatca/master.key (lib/zatca-local.js)
// الشكل المخزن: v1:iv:tag:ciphertext (Base64)
// تنبيه: لو المفتاح الرئيسي ضاع أو اتغير، الأسرار المتخزنة مش هتتفك
//        (ساعتها لازم إعادة تسجيل الوحدات مع الهيئة)
// ============================================================

function masterKey() {
  // نحوله لـ 32 بايت ثابتة مهما كان طوله
  return createHash("sha256").update(getMasterKey().value, "utf8").digest();
}

// مصدر المفتاح: "env" أو "file"
export const masterKeySource = () => getMasterKey().source;

export function encryptSecret(plain) {
  if (plain == null || plain === "") return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([
    cipher.update(String(plain), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    data.toString("base64"),
  ].join(":");
}

export function decryptSecret(value) {
  if (!value) return null;
  const [version, iv, tag, data] = String(value).split(":");
  if (version !== "v1" || !iv || !tag || !data)
    throw new AppError("ZatcaSecretUnreadable");
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      masterKey(),
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof AppError) throw error;
    // المفتاح الرئيسي اتغير أو البيانات اتلعب فيها
    throw new AppError("ZatcaSecretUnreadable");
  }
}
