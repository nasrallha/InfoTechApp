"use client";

import { Card, Col, Row } from "antd";
import { useTranslations } from "next-intl";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { C } from "@/lib/theme";

// ============================================================
// المطعم: الرسوم في فواتير الفترة (الخدمة / التوصيل / التبغ) - شامل الضريبة
// (جوه المبيعات أصلاً: للعلم عشان تعرف كل رسوم لوحدها)
// fees: من التقرير (null = الوحدة مقفولة)، والأنواع اللي فيه بس هي اللي بتظهر
// (فلتر المجموعة في المبيعات: رسوم التبغ بس)
// ============================================================
const KINDS = [
  { key: "tobacco", color: C.warningText },
  { key: "service", color: C.infoText },
  { key: "delivery", color: C.successText },
];

const kindsOf = (fees) => KINDS.filter((k) => fees && k.key in fees);
export const hasFees = (fees) => kindsOf(fees).some((k) => fees[k.key]);

export default function RestaurantFeesSection({ fees }) {
  const t = useTranslations("Reports");
  const { amount: money } = useCurrency();
  if (!hasFees(fees)) return null;
  return (
    <Card
      size="small"
      className="mb-4"
      title={t("fees.Title")}
      extra={<span style={{ color: C.muted, fontSize: 12 }}>{t("fees.Hint")}</span>}
    >
      <Row gutter={[12, 12]}>
        {kindsOf(fees).map((k) => (
          <Col key={k.key} xs={24} sm={8}>
            <div className="laundry-daily-stat" style={{ borderColor: k.color }}>
              <div className="laundry-daily-stat__label">{t(`fees.${k.key}`)}</div>
              <div className="laundry-daily-stat__value" style={{ color: k.color }}>
                {money(fees[k.key])}
              </div>
            </div>
          </Col>
        ))}
      </Row>
    </Card>
  );
}

// الطباعة / Excel: سطور الملخص
export function feesSummary(fees, t, money) {
  if (!hasFees(fees)) return [];
  return kindsOf(fees).map((k) => [`${t(`fees.${k.key}`)} (${t("fees.Short")})`, money(fees[k.key])]);
}

// قسم (sheet) في اليومية
export function feesSheet(fees, t) {
  if (!hasFees(fees)) return null;
  return {
    title: `${t("fees.Title")} (${t("fees.Hint")})`,
    columns: [
      { title: t("fees.Kind"), key: "label", type: "text" },
      { title: t("fees.Amount"), key: "amount", type: "money", width: 16 },
    ],
    rows: kindsOf(fees).map((k) => ({ key: k.key, label: t(`fees.${k.key}`), amount: fees[k.key] })),
  };
}
