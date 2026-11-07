"use client";

import { useEffect, useState } from "react";
import { Select } from "antd";
import { IdcardOutlined } from "@ant-design/icons";
import { useLocale } from "next-intl";
import { useModule, useModuleSettings } from "@/components/auth/AuthProvider";
import { useStaffT } from "./useStaffT";
import { loadTechnicians } from "./LineJob";

// مقدم الخدمة في الكاشير بيظهر للأنشطة اللي شغلها بالعاملة/الحلاق/المعالج
export function useStaffOnPos() {
  const on = useModule("technicians");
  const { staffTitle = "technician" } = useModuleSettings();
  return on && staffTitle !== "technician";
}

// ============================================================
// اختيار مقدم الخدمة (العاملة / الحلاق ...) - الكاشير
// value: technicianId | onChange(id | null)
// ============================================================
export default function StaffSelect({
  value,
  onChange,
  size,
  style,
  placeholder,
}) {
  const t = useStaffT();
  const locale = useLocale();
  const [techs, setTechs] = useState([]);
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);

  useEffect(() => {
    let alive = true;
    loadTechnicians().then((list) => alive && setTechs(list));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Select
      allowClear
      showSearch
      size={size}
      style={style}
      optionFilterProp="label"
      suffixIcon={<IdcardOutlined />}
      placeholder={placeholder ?? t("PickTechnician")}
      notFoundContent={t("NoTechnicians")}
      value={value ?? undefined}
      onChange={(v) => onChange(v ?? null)}
      options={techs.map((x) => ({ value: x.id, label: nm(x) }))}
    />
  );
}
