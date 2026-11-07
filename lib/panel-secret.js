import "server-only";
import { createDecipheriv, createHash } from "node:crypto";
import { AppError } from "@/lib/errors";

// ============================================================
// فك باسوردات قواعد الشركات اللي لوحة التحكم شفّرتها
// نفس طريقة اللوحة بالظبط (AES-256-GCM بمفتاح PANEL_SECRET_KEY)
// ⚠ المفتاح هنا لازم يبقى نفس اللي في .env بتاع اللوحة
// الشكل: v1:iv:tag:ciphertext (Base64)
// ============================================================
function key() {
  const raw = process.env.PANEL_SECRET_KEY?.trim();
  if (!raw || raw.length < 32) throw new AppError("PanelKeyMissing");
  return createHash("sha256").update(raw, "utf8").digest();
}

export function decryptPanelSecret(value) {
  if (!value) return null;
  const [version, iv, tag, data] = String(value).split(":");
  if (version !== "v1" || !iv || !tag || !data)
    throw new AppError("PanelSecretUnreadable");
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("PanelSecretUnreadable");
  }
}
