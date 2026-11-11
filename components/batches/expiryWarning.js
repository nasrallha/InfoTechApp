"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { useModuleSettings } from "@/components/auth/AuthProvider";
import { formatDay, today } from "@/lib/dates";

// ============================================================
// تتبع الصلاحية وقت البيع (الفاتورة والكاشير)
// - تنبيه لو أقرب دفعة منتهية أو قربت تنتهي (أيام تنبيه الصنف أو إعداد الشركة)
// - الدفعة الممسوحة (GS1) منتهية ← تنبيه (والسيرفر بيمنعها لو الإعداد)
// ============================================================
export function useExpiryWarning() {
  const t = useTranslations("Batches");
  const locale = useLocale();
  const { expiry } = useModuleSettings();
  return useCallback(
    (product, batch = null) => {
      if (!expiry || !product?.trackExpiry) return;
      const name = locale === "ar" ? product.arName : product.enName;
      // الدفعة الممسوحة نفسها
      if (batch?.expDate) {
        if (batch.expDate < today())
          message.error(t("ScannedExpired", { batch: batch.batchNo }));
        return;
      }
      const next = product.nextExpiry;
      if (!next) return;
      const alertDays = next.alertDays ?? expiry.alertDays ?? 30;
      if (next.days < 0)
        message.error(t("WarnExpired", { name, days: -next.days }));
      else if (next.days === 0) message.warning(t("WarnExpiresToday", { name }));
      else if (next.days <= alertDays)
        message.warning(
          t("WarnNear", { name, days: next.days, date: formatDay(next.date) }),
        );
    },
    [expiry, locale, t],
  );
}

// إضافة كمية دفعة ممسوحة لسطر: [{ batchId, qty, batchNo }]
export function addBatchPick(list, batch, qty) {
  const prev = list ?? [];
  const found = prev.find((b) => b.batchId === batch.id);
  if (found)
    return prev.map((b) =>
      b === found
        ? { ...b, qty: Math.round((b.qty + qty) * 1000) / 1000 }
        : b,
    );
  return [...prev, { batchId: batch.id, qty, batchNo: batch.batchNo }];
}
