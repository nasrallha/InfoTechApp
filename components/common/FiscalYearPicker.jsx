"use client";

import { useEffect, useState } from "react";
import { Select } from "antd";
import { useTranslations } from "next-intl";
import { today } from "@/lib/dates";
import { fiscalYearOptionsAction } from "@/actions/fiscal-year.actions";

// ============================================================
// اختيار السنة المالية في فلاتر الفترة (كشوف الحساب والتقارير)
// اختيار سنة ← onPick(from, to) بتواريخها (والسنة الحالية: لحد النهارده)
// label: عنوان صغير فوق (زي خانات من / إلى)
// ============================================================
export default function FiscalYearPicker({ onPick, size, label = true, style }) {
  const t = useTranslations("Reports");
  const [years, setYears] = useState([]);
  useEffect(() => {
    let alive = true;
    fiscalYearOptionsAction().then((res) => {
      if (alive && res.success) setYears(res.data);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!years.length) return null;

  const select = (
    <Select
      size={size}
      allowClear
      style={{ width: 150, ...style }}
      placeholder={t("FiscalYear")}
      value={null}
      options={years.map((y) => ({ value: y.code, label: String(y.code) }))}
      onChange={(code) => {
        const y = years.find((x) => x.code === code);
        if (!y) return;
        const now = today();
        onPick(y.startDate, y.endDate < now ? y.endDate : now);
      }}
    />
  );
  if (!label) return select;
  return (
    <div>
      <div className="text-gray-500 text-xs mb-1">{t("FiscalYear")}</div>
      {select}
    </div>
  );
}
