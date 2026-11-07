"use client";

import { Button } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { lineConversion, qtyText } from "@/lib/unit-qty";

// ============================================================
// تحويل السطر للوحدة التانية (السيراميك: م² ↔ كرتونة، الأقمشة: متر ↔ طاقة)
// - بالأساسية: «= 6.944 كرتونة» + زرار «تقريب: 7 كرتونة = 10.08 م²»
//   (اختياري: الكاشير يبيع بمزاجه، كسر كرتونة أو فرط)
// - بالتعبئة: «= 10.08 م²»
// onRound(qty): الكمية الجديدة بالأساسية
// ============================================================
export default function LineConversion({ line, onRound, size = "small" }) {
  const t = useTranslations("Packs");
  const locale = useLocale();
  const nm = (u) => (u ? (locale === "ar" ? u.arName : u.enName) : "");
  const c = lineConversion(line);
  if (!c) return null;
  return (
    <span className="line-conv">
      <SwapOutlined />{" "}
      <bdi>
        = {qtyText(c.qty)} {nm(c.unit)}
      </bdi>
      {c.round && onRound && (
        <Button
          size={size}
          type="link"
          className="line-conv__round"
          onClick={() => onRound(c.round.qty)}
        >
          {t("Round", {
            packs: c.round.packs,
            pack: nm(c.unit),
            qty: qtyText(c.round.qty),
            base: nm(c.base),
          })}
        </Button>
      )}
    </span>
  );
}
