"use server";

// الطلب الأونلاين للمطعم: صفحة العميل (من غير دخول) + إعداداته + قبول/رفض الكاشير
import { headers } from "next/headers";
import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { withPublicCompany } from "@/lib/public-company";
import { idField } from "@/validations/common.schema";
import {
  onlineSettingsSchema,
  publicMenuSchema,
  publicOrderSchema,
  publicTablesSchema,
} from "@/validations/restaurant.schema";
import {
  publicCreateOrder,
  publicMenuInfo,
  saveOnlineSettings,
} from "@/services/restaurant-online.service";
import {
  acceptOnlineOrder,
  pendingOnlineCount,
  rejectOnlineOrder,
} from "@/services/restaurant-pos.service";
import { availableTables } from "@/services/restaurant-table.service";

// ---------- الإعدادات (شاشة المطعم) ----------
export const saveOnlineSettingsAction = async (input) =>
  runAction(onlineSettingsSchema, input, (d) => saveOnlineSettings(d), {
    permission: "restaurant.manage",
    refresh: true,
  });

// ---------- الكاشير ----------
const pos = { permission: "sales.pos" };
export const acceptOnlineOrderAction = async (id) =>
  runAction(idField, id, (d, u) => acceptOnlineOrder(d, u), pos);
export const rejectOnlineOrderAction = async (id) =>
  runAction(idField, id, (d, u) => rejectOnlineOrder(d, u), pos);
// عدد الطلبات الجديدة (العداد على زرار الطلبات)
export const pendingOnlineCountAction = async () =>
  runAction(null, null, (d, u) => pendingOnlineCount(u), pos);

// ============================================================
// صفحة العميل: من غير تسجيل دخول، الشركة من الكود اللي في اللينك
// ============================================================
// حد بسيط لكل جهاز (IP): عشان محدش يغرق الطلبات
const hits = new Map();
async function limit(kind, max, windowMs) {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local";
  const key = `${kind}:${ip}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new AppError("TooManyRequests");
  list.push(now);
  hits.set(key, list);
}

const inCompany = (code, fn) => withPublicCompany(code, "restaurant", fn);

export const publicMenuAction = async (input) =>
  runAction(
    publicMenuSchema,
    input,
    async (d) => {
      await limit("menu", 120, 10 * 60_000);
      return inCompany(d.code, () => publicMenuInfo());
    },
    { public: true },
  );

export const publicCreateOrderAction = async (input) =>
  runAction(
    publicOrderSchema,
    input,
    async ({ code, ...d }) => {
      await limit("order", 8, 30 * 60_000);
      return inCompany(code, () => publicCreateOrder(d));
    },
    { public: true },
  );

// الطاولات الفاضية في الميعاد وتكفي عدد الأفراد (حجز طاولة)
export const publicTablesAction = async (input) =>
  runAction(
    publicTablesSchema,
    input,
    async ({ code, ...d }) => {
      await limit("tables", 120, 10 * 60_000);
      return inCompany(code, () => availableTables(d));
    },
    { public: true },
  );
