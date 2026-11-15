"use client";

import { Col, Input, Row } from "antd";
import { useLocale } from "next-intl";

// ============================================================
// خانات المقاسات (الطول، الكتف ...) - قيمة نصية لكل خانة
// fields: [{ id, arName, enName }] | value: { "<fieldId>": "52" }
// ============================================================
export default function MeasuresGrid({
  fields,
  value = {},
  onChange,
  disabled = false,
}) {
  const locale = useLocale();
  const nameOf = (f) => (locale === "ar" ? f.arName : f.enName || f.arName);
  return (
    <Row gutter={[8, 8]}>
      {fields.map((f) => (
        <Col key={f.id} xs={12} sm={8} md={6} lg={4} xxl={3}>
          <div className="text-xs text-slate-500 mb-1">{nameOf(f)}</div>
          <Input
            dir="ltr"
            maxLength={20}
            autoComplete="off"
            disabled={disabled}
            value={value[String(f.id)] ?? ""}
            onChange={(e) =>
              onChange?.({ ...value, [String(f.id)]: e.target.value })
            }
          />
        </Col>
      ))}
    </Row>
  );
}
