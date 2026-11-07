import "server-only";
import { getCached, setCached } from "./tenant-state";
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
  // كاش لكل شركة لوحدها (lib/tenant-state)
  const cached = await getCached("security", TTL);
  if (cached !== undefined) return cached;
  const saved = await prisma.securitySettings.findUnique({
    where: { id: SETTINGS_ID },
    select: securitySelect,
  });
  const value = saved ?? { ...DEFAULT_SECURITY, updatedAt: null };
  await setCached("security", value);
  return value;
}

export async function saveSecuritySettingsRow(data) {
  const saved = await prisma.securitySettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
    select: securitySelect,
  });
  await setCached("security", saved);
  return saved;
}

// ------------------------------------------------------------
// عنوان الجهاز (IP) والمتصفح من الطلب الحالي
// على السيرفر (VPS) البرنامج ورا nginx: العنوان الحقيقي في X-Forwarded-For
// ------------------------------------------------------------
const cleanIp = (ip) => {
  const v = String(ip ?? "").trim();
  if (!v) return null;
  // "::1" = الجهاز نفسه بـ IPv6 ← 127.0.0.1 (أوضح في السجلات)
  if (v === "::1") return "127.0.0.1";
  return v.replace(/^::ffff:/i, "").slice(0, 45);
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
