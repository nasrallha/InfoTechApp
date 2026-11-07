"use client";

import { Tag } from "antd";
import { useTranslations } from "next-intl";
import { CLAIM_COLORS } from "./claimColors";

// مرحلة طلب الضمان / الصيانة بلون
export function ClaimStatusTag({ status }) {
  const t = useTranslations("Claims");
  return (
    <Tag color={CLAIM_COLORS[status] ?? "default"}>{t(`Status_${status}`)}</Tag>
  );
}

// عدد الأيام من تاريخ لحد النهارده
export function claimAgeDays(date) {
  if (!date) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000),
  );
}
