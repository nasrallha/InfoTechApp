"use client";

import { Tag } from "antd";
import { useTranslations } from "next-intl";
import { today } from "@/lib/dates";

// الضمان "قرّب يخلص": خلال كام يوم (نفس قيمة التقرير)
export const EXPIRING_DAYS = 30;

// الأيام الباقية في الضمان (سالب = منتهي من كام يوم)، null = بدون ضمان
export function warrantyDaysLeft(endsAt) {
  if (!endsAt) return null;
  const end = Date.parse(`${String(endsAt).slice(0, 10)}T00:00:00Z`);
  const now = Date.parse(`${today()}T00:00:00Z`);
  return Math.round((end - now) / 86_400_000);
}

// حالة الضمان بلون: ساري (أخضر) / قرّب يخلص (برتقالي) / منتهي (أحمر)
export default function WarrantyBadge({ endsAt }) {
  const t = useTranslations("Serials");
  const left = warrantyDaysLeft(endsAt);
  if (left == null) return <Tag>{t("NoWarranty")}</Tag>;
  if (left < 0)
    return <Tag color="red">{t("WarrantyExpiredAgo", { n: -left })}</Tag>;
  if (left <= EXPIRING_DAYS)
    return <Tag color="orange">{t("WarrantyEndingIn", { n: left })}</Tag>;
  return <Tag color="green">{t("WarrantyActiveLeft", { n: left })}</Tag>;
}

// حالة القطعة
export function SerialStatusTag({ status }) {
  const t = useTranslations("Serials");
  const color =
    status === "sold"
      ? "blue"
      : status === "in_stock"
        ? "green"
        : status === "damaged"
          ? "red"
          : "default";
  return <Tag color={color}>{t(`Status_${status}`)}</Tag>;
}
