"use client";

import { Checkbox, InputNumber, Space } from "antd";
import { useTranslations } from "next-intl";
import DayPicker from "@/components/common/DayPicker";
import { computeNextChange, hasChangeInterval } from "@/lib/vehicle-change";

// ============================================================
// سطر فيه تغيير دوري (زيت، فلتر...) في فاتورة على سيارة
// ☑ اتغيّر على السيارة ← الغيار القادم (محسوب، ويتعدّل يدوي)
// تشيل العلامة: الصنف اتباع بس (العميل خده) ← من غير ميعاد للسيارة
// line.change: { applied, manual, nextKm, nextDate } (null = تلقائي)
// ============================================================

// القيم اللي هتتبعت للسيرفر (نفس اللي ظاهر في الشاشة)
export function lineChangeValue(line, { odometer, day }) {
  if (!hasChangeInterval(line)) return null;
  const c = line.change ?? {};
  if (c.applied === false)
    return { applied: false, nextKm: null, nextDate: null };
  if (c.manual)
    return {
      applied: true,
      nextKm: c.nextKm ?? null,
      nextDate: c.nextDate ?? null,
    };
  const auto = computeNextChange({
    km: line.changeKm,
    months: line.changeMonths,
    odometer,
    day,
  });
  return { applied: true, nextKm: auto.nextKm, nextDate: auto.nextDay };
}

export default function LineChange({ line, odometer, day, onChange }) {
  const t = useTranslations("Vehicles");
  if (!hasChangeInterval(line)) return null;
  const value = lineChangeValue(line, { odometer, day });
  const applied = value.applied;

  // أي تعديل في الأرقام = يدوي (مش بيتحسب تاني لو العداد اتغير)
  const set = (patch) =>
    onChange({
      change: {
        applied: true,
        manual: true,
        nextKm: value.nextKm,
        nextDate: value.nextDate,
        ...patch,
      },
    });

  return (
    <div className="pur-line__code mt-1">
      <Space wrap size={6} align="center">
        <Checkbox
          checked={applied}
          onChange={(e) =>
            onChange({
              change: e.target.checked
                ? null
                : { ...(line.change ?? {}), applied: false },
            })
          }
        >
          {t("ChangedOnVehicle")}
        </Checkbox>
        {applied && (
          <>
            <span>{t("NextChange")}:</span>
            {Number(line.changeKm) > 0 && (
              <InputNumber
                size="small"
                min={0}
                max={99999999}
                precision={0}
                controls={false}
                style={{ width: 110 }}
                placeholder={t("NeedsOdometer")}
                value={value.nextKm}
                onChange={(v) => set({ nextKm: v ?? null })}
                suffix={t("Km")}
              />
            )}
            {Number(line.changeKm) > 0 && Number(line.changeMonths) > 0 && (
              <span>{t("Or").trim()}</span>
            )}
            {Number(line.changeMonths) > 0 && (
              <DayPicker
                size="small"
                style={{ width: 130 }}
                min={day}
                value={value.nextDate}
                onChange={(v) => set({ nextDate: v ?? null })}
              />
            )}
          </>
        )}
      </Space>
    </div>
  );
}
