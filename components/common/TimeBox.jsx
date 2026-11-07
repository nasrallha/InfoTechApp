"use client";

import { TimePicker } from "antd";
import dayjs from "dayjs";

// ============================================================
// اختيار وقت (اختياري): القيمة نص "HH:mm"، وفاضي = اليوم كله
// ============================================================
export default function TimeBox({ value, onChange, placeholder, style }) {
  return (
    <TimePicker
      allowClear
      format="HH:mm"
      minuteStep={5}
      needConfirm={false}
      placeholder={placeholder}
      style={{ width: 120, ...style }}
      value={value ? dayjs(`2000-01-01T${value}`) : null}
      onChange={(d) => onChange?.(d ? d.format("HH:mm") : null)}
    />
  );
}
