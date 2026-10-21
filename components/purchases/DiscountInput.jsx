"use client";

import { Button, Tooltip } from "antd";
import { TagOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { useCurrency } from "@/components/common/CurrencyProvider";
import ScanSafeNumber from "@/components/common/ScanSafeNumber";

// لون الخصم في كل الشاشات
export const DISCOUNT_COLOR = "#cf1322";

// ============================================================
// خصم: صندوق بخلفية حمراء فاتحة فيه
//   - زرين واضحين لنوع الخصم: نسبة (%) أو مبلغ (رمز العملة ر.س)
//     المختار أحمر ممتلئ، والآخر أبيض بإطار أحمر
//   - خانة القيمة (أرقام فقط) وجنبها أيقونة الخصم
// onChange(type, value)
// ============================================================
export default function DiscountInput({ type, value, onChange, disabled }) {
  const t = useTranslations("Purchases");
  const { symbolNode: symbol, decimals } = useCurrency();

  const switchTo = (next) => {
    if (next === type) return;
    onChange(next, next === "percent" ? Math.min(value ?? 0, 100) : value);
  };

  const typeButton = (key, label, tip) => (
    <Tooltip title={tip}>
      <Button
        color="danger"
        variant={type === key ? "solid" : "outlined"}
        disabled={disabled}
        onClick={() => switchTo(key)}
        className="disc-input__type"
      >
        {label}
      </Button>
    </Tooltip>
  );

  return (
    <div className="disc-input">
      <div className="disc-input__types">
        {typeButton("percent", "%", t("DiscountPercent"))}
        {typeButton("amount", <bdi>{symbol}</bdi>, t("DiscountAmount"))}
      </div>
      <ScanSafeNumber
        field="discount"
        className="disc-input__value"
        min={0}
        max={type === "percent" ? 100 : undefined}
        precision={type === "percent" ? 2 : decimals}
        controls={false}
        disabled={disabled}
        value={value}
        prefix={<TagOutlined style={{ color: DISCOUNT_COLOR }} />}
        onFocus={(e) => e.target.select()}
        onChange={(v) => onChange(type, v ?? 0)}
      />
    </div>
  );
}
