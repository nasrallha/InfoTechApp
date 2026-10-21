"use client";

import { DatePicker } from "antd";
import dayjs from "dayjs";

// يظهر للمستخدم دائماً يوم/شهر/سنة (مهما كانت إعدادات الجهاز)
export const DAY_FORMAT = "DD/MM/YYYY";

// ============================================================
// اختيار يوم: القيمة نص "YYYY-MM-DD" (نفس شكل قاعدة البيانات والسيرفر)
// والعرض والكتابة بصيغة DD/MM/YYYY
// min / max: أول وآخر يوم مسموح (YYYY-MM-DD)، والأيام خارجها تظهر معطّلة
// يعمل داخل Form.Item (value / onChange) أو لوحده
// ============================================================
export default function DayPicker({
  value,
  onChange,
  min,
  max,
  disabled,
  style,
  allowClear = false,
  ...rest
}) {
  return (
    <DatePicker
      {...rest}
      style={{ width: "100%", ...style }}
      format={DAY_FORMAT}
      allowClear={allowClear}
      disabled={disabled}
      value={value ? dayjs(value) : null}
      onChange={(d) => onChange?.(d ? d.format("YYYY-MM-DD") : undefined)}
      disabledDate={(d) => {
        const day = d.format("YYYY-MM-DD");
        return (min && day < min) || (max && day > max);
      }}
    />
  );
}
