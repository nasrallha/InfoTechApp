"use client";

import { useTranslations } from "next-intl";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { formatDay } from "@/lib/dates";

// ============================================================
// صيغ خانات العقد في الواجهة (نفس templateFormat في السيرفر بالظبط)
// ← معاينة نص العقد قبل الحفظ تطلع زي اللي هيتحفظ
// ============================================================
export function useRentFormat() {
  const t = useTranslations("RealEstate");
  const { symbol, decimals } = useCurrency();
  const money = (v) =>
    `${Number(v || 0).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })} ${symbol ?? ""}`.trim();
  return {
    money,
    day: (d) => formatDay(d),
    kind: (k) => t(`kind_${k}`),
    useType: (u) => t(`use_${u}`),
    payEvery: (m) => t(`every_${m}`),
    duration: (months) => t("DurationMonths", { n: Math.round(months * 10) / 10 }),
    row: (r) =>
      t("InstallmentRow", {
        seq: r.seq,
        from: formatDay(r.periodFrom),
        to: formatDay(r.periodTo),
        due: formatDay(r.dueDate),
        amount: money(r.amount),
      }),
  };
}
