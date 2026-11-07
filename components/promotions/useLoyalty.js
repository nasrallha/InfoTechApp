"use client";

import { useEffect, useState } from "react";
import { Tag } from "antd";
import { GiftOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { loyaltyStatusAction } from "@/actions/promotion.actions";

// ============================================================
// عروض الولاء (كل كام مرة ← مرة مجانية) للعميل المختار في الفاتورة
// ← { [promoId]: { paid, rewards } } أو null (من غير عميل / مفيش عروض ولاء)
// ============================================================
export function useLoyalty(customerId, promotions = [], excludeSaleId) {
  const has = promotions.some((p) => p.scope === "loyalty");
  const [state, setState] = useState({ key: null, data: null });
  const key = has && customerId ? `${customerId}:${excludeSaleId ?? ""}` : null;

  useEffect(() => {
    if (!key) return;
    let alive = true;
    loyaltyStatusAction({ customerId, excludeSaleId }).then((res) => {
      if (alive) setState({ key, data: res.success ? res.data : null });
    });
    return () => {
      alive = false;
    };
  }, [key, customerId, excludeSaleId]);

  return key && state.key === key ? state.data : null;
}

// سطر تنبيه: "مجانية في الفاتورة دي" / "فاضل 2 على المجانية"
export function LoyaltyHint({ info = [] }) {
  const t = useTranslations("Promotions");
  const locale = useLocale();
  if (!info.length) return null;
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  return (
    <div className="mt-2" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {info.map((i) => (
        <Tag
          key={i.promo.id}
          color={i.free ? "magenta" : "purple"}
          icon={<GiftOutlined />}
        >
          {nm(i.promo)}:{" "}
          {i.free
            ? t("LoyaltyFreeNow", { n: i.free })
            : i.left === 0
              ? t("LoyaltyNextFree")
              : t("LoyaltyLeft", { n: i.left })}
        </Tag>
      ))}
    </div>
  );
}
