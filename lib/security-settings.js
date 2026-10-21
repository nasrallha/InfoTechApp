import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SECURITY } from "@/lib/login-security";

// ============================================================
// إعدادات أمان الدخول (صف واحد id = 1)
// - بتتقرا مع كل طلب (فحص الجلسة)، فبنحفظها في الذاكرة 30 ثانية
//   وبتتمسح فوراً بعد الحفظ من شاشة الإعدادات
// ============================================================

const SETTINGS_ID = 1;
const TTL = 30_000;
const g = globalThis;

export const securitySelect = {
  maxAttempts: true,
  attemptWindowMinutes: true,
  lockMinutes: true,
  progressiveLock: true,
  showRemaining: true,
  ipMaxAttempts: true,
  idleMinutes: true,
  sessionHours: true,
  logoutOnBrowserClose: true,
  maxDevices: true,
  deviceLimitMode: true,
  deviceLimitSkipSuper: true,
  logRetentionDays: true,
  updatedAt: true,
};

export async function getSecuritySettings() {
  const c = g.__erpSecurity;
  if (c && Date.now() - c.at < TTL) return c.value;
  const saved = await prisma.securitySettings.findUnique({
    where: { id: SETTINGS_ID },
    select: securitySelect,
  });
  const value = saved ?? { ...DEFAULT_SECURITY, updatedAt: null };
  g.__erpSecurity = { at: Date.now(), value };
  return value;
}

export async function saveSecuritySettingsRow(data) {
  const saved = await prisma.securitySettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
    select: securitySelect,
  });
  g.__erpSecurity = { at: Date.now(), value: saved };
  return saved;
}

// ------------------------------------------------------------
// عنوان الجهاز (IP) والمتصفح من الطلب الحالي
// على السيرفر (VPS) البرنامج ورا nginx: العنوان الحقيقي في X-Forwarded-For
// ------------------------------------------------------------
const cleanIp = (ip) => {
  const v = String(ip ?? "").trim();
  if (!v) return null;
  return v.replace(/^::ffff:/, "").slice(0, 45);
};

export async function clientInfo() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0];
  const ip = cleanIp(
    forwarded || h.get("x-real-ip") || h.get("cf-connecting-ip"),
  );
  const userAgent = h.get("user-agent")?.slice(0, 255) ?? null;
  return { ip, userAgent };
}
