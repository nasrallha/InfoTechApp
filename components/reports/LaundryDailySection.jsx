"use client";

import { Card, Col, Row } from "antd";
import { useTranslations } from "next-intl";
import { C } from "@/lib/theme";

// ============================================================
// تقرير اليومية - طلبات المغسلة (وحدة laundry): أعداد للعلم، برا الصافي
// المسجّلة والمسلّمة والملغية في الفترة + الباقية لحد دلوقتي
// (فواتير الاشتراك: سطر "رصيد الاشتراك" في جدول طرق الدفع، للعلم)
// laundry: من dailyReport (null لو الوحدة مقفولة)
// ============================================================
export default function LaundryDailySection({ laundry }) {
  const t = useTranslations("Reports");
  const L = (k, v) => t(`laundry.${k}`, v);
  const o = laundry.orders;

  const stat = (label, value, sub, color) => (
    <Col xs={12} md={6}>
      <div className="laundry-daily-stat" style={{ borderColor: color }}>
        <div className="laundry-daily-stat__label">{label}</div>
        <div className="laundry-daily-stat__value" style={{ color }}>
          {value}
        </div>
        {sub && <div className="laundry-daily-stat__sub">{sub}</div>}
      </div>
    </Col>
  );

  return (
    <Card
      size="small"
      className="mb-4"
      title={L("Orders")}
      extra={<span style={{ color: C.muted, fontSize: 12 }}>{L("InfoOnly")}</span>}
    >
      <Row gutter={[12, 12]}>
        {stat(L("Registered"), o.registered, L("PiecesN", { n: o.registeredQty }), C.infoText)}
        {stat(L("Delivered"), o.delivered, L("PiecesN", { n: o.deliveredQty }), C.successText)}
        {stat(L("Cancelled"), o.cancelled, null, C.dangerText)}
        {stat(L("Remaining"), o.remaining, L("PiecesN", { n: o.remainingQty }), C.warningText)}
      </Row>
    </Card>
  );
}

// قسم الطباعة / Excel (ReportSheet): أعداد الطلبات
export function laundryDailySheets(laundry, t) {
  if (!laundry) return [];
  const L = (k, v) => t(`laundry.${k}`, v);
  const o = laundry.orders;
  return [
    {
      title: `${L("Orders")} (${L("InfoOnly")})`,
      columns: [
        { title: L("Item"), key: "label", type: "text" },
        { title: L("Count"), key: "count", type: "number", width: 12 },
        { title: L("Pieces"), key: "qty", type: "number", width: 12 },
      ],
      rows: [
        ["r", L("Registered"), o.registered, o.registeredQty],
        ["d", L("Delivered"), o.delivered, o.deliveredQty],
        ["c", L("Cancelled"), o.cancelled, null],
        ["m", L("Remaining"), o.remaining, o.remainingQty],
      ].map(([key, label, count, qty]) => ({ key, label, count, qty })),
    },
  ];
}
