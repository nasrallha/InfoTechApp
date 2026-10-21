"use client";

import { Tag } from "antd";
import { useLocale } from "next-intl";
import { breakdown } from "@/lib/unit-breakdown";

const q3 = (v) => Number(Number(v ?? 0).toFixed(3));

// الكمية مفصّلة بوحدات الصنف: [6 كرتونة] [2 شدة] [1 حبة]
// (الصنف بوحدة واحدة: لا شيء)
export default function UnitBreakdown({ qty, units }) {
  const locale = useLocale();
  if (!units || units.length < 2) return null;
  const nameOf = (u) => (locale === "ar" ? u.arName : u.enName);
  const parts = breakdown(qty, units).filter((p) => p.qty !== 0);
  if (!parts.length) return <span className="text-gray-400">0</span>;
  const negative = qty < 0;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      {parts.map((p) => (
        <Tag
          key={p.unit.id}
          color={negative ? "red" : "blue"}
          style={{ marginInlineEnd: 0 }}
        >
          <b>{q3(Math.abs(p.qty))}</b> {nameOf(p.unit)}
        </Tag>
      ))}
    </span>
  );
}
