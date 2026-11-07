import "server-only";
import { cache } from "react";
import { prisma } from "./prisma";
import { multiTenant } from "./tenant";
import { dbDateToDay, today } from "./dates";

// ============================================================
// اشتراك الشركة (وضع الشركات بس)
// بنقرا من جدول subscription جوه قاعدة الشركة (لوحة التحكم هي اللي بتكتبه)
//   active / expiring : شغال
//   grace             : انتهى، بس في فترة السماح (شغال عادي + تنبيه)
//   readonly          : بعد السماح: يشوف ويطبع بس
//   expired           : بعد القراءة فقط: الدخول مقفول لحد التجديد
//   suspended / cancelled / pending : مقفول
//   missing           : جدول الاشتراك فاضي (اللوحة لسه مكتبتش) ← مقفول
// ============================================================

const DAY = 24 * 60 * 60 * 1000;
const addDays = (day, n) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

// الحالات اللي الدخول فيها مقفول (غير مالك البرنامج)
export const BLOCKED_STATES = [
  "expired",
  "suspended",
  "cancelled",
  "pending",
  "missing",
];

export function subscriptionState(sub, now = today()) {
  if (!sub) return { state: "missing" };
  const endsAt = dbDateToDay(sub.endsAt);
  const graceEndsAt = addDays(endsAt, sub.graceDays ?? 0);
  const readonlyEndsAt = addDays(graceEndsAt, sub.readonlyDays ?? 0);
  const daysLeft = daysBetween(now, endsAt);
  const base = { daysLeft, endsAt, graceEndsAt, readonlyEndsAt };
  if (["pending", "cancelled", "suspended"].includes(sub.status))
    return { ...base, state: sub.status };
  if (now <= endsAt)
    return {
      ...base,
      state: daysLeft <= (sub.expiringDays ?? 7) ? "expiring" : "active",
    };
  if (now <= graceEndsAt) return { ...base, state: "grace" };
  if (now <= readonlyEndsAt) return { ...base, state: "readonly" };
  return { ...base, state: "expired" };
}

// أعمدة الاشتراك من أول نسخة (موجودة في أي قاعدة فيها جدول الاشتراك)
const BASE_SELECT = {
  id: true,
  companyCode: true,
  companySerial: true,
  status: true,
  suspendReason: true,
  planArName: true,
  planEnName: true,
  features: true,
  maxUsers: true,
  maxBranches: true,
  maxInvoicesMonth: true,
  startsAt: true,
  endsAt: true,
  graceDays: true,
  readonlyDays: true,
  expiringDays: true,
  syncedAt: true,
};

// الاشتراك + حالته (مرة واحدة لكل طلب)
// null = البرنامج مش في وضع الشركات (مفيش قيود)
export const getSubscription = cache(async () => {
  if (!multiTenant()) return null;
  let sub;
  try {
    sub = await prisma.subscription.findUnique({ where: { id: 1 } });
  } catch (e) {
    // قاعدة الشركة لسه متحدّثتش (عمود جديد زي maxProducts أو vendor مش موجود):
    // نقرا الأعمدة الأساسية بس عشان البرنامج ميقفش، لحد ما تتحدّث من اللوحة
    if (e?.code !== "P2022") throw e;
    sub = await prisma.subscription.findUnique({
      where: { id: 1 },
      select: BASE_SELECT,
    });
  }
  return {
    ...(sub ?? {}),
    ...subscriptionState(sub),
    suspendReason: sub?.suspendReason ?? null,
  };
});

export const isBlocked = (s) => Boolean(s && BLOCKED_STATES.includes(s.state));
