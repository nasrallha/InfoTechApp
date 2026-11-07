"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Select, Space, Spin, Tag, Tooltip } from "antd";
import { CarOutlined, PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { formatDay } from "@/lib/dates";
import { useCan } from "@/components/auth/AuthProvider";
import { searchVehiclesAction } from "@/actions/vehicle.actions";
import VehicleFormModal from "./VehicleFormModal";

// لون الغيار الجاي
export const CHANGE_COLORS = {
  overdue: "red",
  soon: "orange",
  later: "green",
};

// نص الغيار الجاي: عند 45,000 كم / بتاريخ ...
export function changeText(t, c) {
  if (!c) return null;
  const parts = [];
  if (c.nextKm != null)
    parts.push(t("AtKm", { km: Number(c.nextKm).toLocaleString("en") }));
  if (c.nextDate) parts.push(t("OnDate", { date: formatDay(c.nextDate) }));
  return parts.join(t("Or"));
}

// ============================================================
// اختيار السيارة في فاتورة البيع (وحدة vehicles - الورش)
// - البحث برقم اللوحة (أو الجوال / العميل)
// - مش موجودة؟ "إضافة سيارة" باللوحة المكتوبة
// - اختيار سيارة ليها عميل والفاتورة من غير عميل ← العميل بيتختار لوحده
// value: السيارة المختارة (كائن) | onChange(vehicle | null)
// ============================================================
export default function VehiclePicker({
  value,
  onChange,
  customers = [],
  customerId,
  disabled,
}) {
  const t = useTranslations("Vehicles");
  const locale = useLocale();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const can = useCan();
  const canAdd = can("vehicles.create") || can("sales.create");
  const [text, setText] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(null); // { plateNo }
  const reqId = useRef(0);

  const search = (q) => {
    const id = ++reqId.current;
    setLoading(true);
    searchVehiclesAction(q).then((res) => {
      if (id !== reqId.current) return;
      setLoading(false);
      setResults(res.success ? res.data : []);
    });
  };

  // بحث أثناء الكتابة (بعد توقف قصير)
  useEffect(() => {
    const timer = setTimeout(() => search(text), text ? 300 : 0);
    return () => clearTimeout(timer);
  }, [text]);

  const list =
    value && !results.some((r) => r.id === value.id)
      ? [value, ...results]
      : results;
  const byId = new Map(list.map((v) => [v.id, v]));

  const label = (v) =>
    [v.plateNo, v.vehicleType, nm(v.customer) || v.phone]
      .filter(Boolean)
      .join(" — ");

  return (
    <>
      <Space.Compact style={{ width: "100%" }}>
        <Select
          showSearch
          allowClear
          disabled={disabled}
          style={{ width: "100%" }}
          placeholder={t("PickPlaceholder")}
          suffixIcon={<CarOutlined />}
          value={value?.id}
          filterOption={false}
          searchValue={text}
          onSearch={setText}
          onChange={(id) => {
            onChange(id ? byId.get(id) : null);
            setText("");
          }}
          notFoundContent={
            loading ? (
              <Spin size="small" />
            ) : text.trim() && canAdd ? (
              <Button
                type="link"
                icon={<PlusOutlined />}
                onClick={() => setAdding({ plateNo: text.trim() })}
              >
                {t("AddPlate", { plate: text.trim() })}
              </Button>
            ) : (
              t("NoVehicles")
            )
          }
          options={list.map((v) => ({ value: v.id, label: label(v) }))}
        />
        {canAdd && (
          <Tooltip title={t("New")}>
            <Button
              type="primary"
              icon={<CarOutlined />}
              disabled={disabled}
              aria-label={t("New")}
              onClick={() => setAdding({ plateNo: text.trim() || undefined })}
            />
          </Tooltip>
        )}
      </Space.Compact>

      {/* بيانات السيارة المختارة: آخر عداد والغيار الجاي */}
      {value && (
        <div className="pur-line__code mt-1">
          {value.lastOdometer != null && (
            <span className="me-2">
              {t("LastOdometer")}:{" "}
              <b>{Number(value.lastOdometer).toLocaleString("en")}</b>
            </span>
          )}
          {value.change && (
            <Tag color={CHANGE_COLORS[value.change.level] ?? "blue"}>
              {t("NextChange")}: {changeText(t, value.change)}
            </Tag>
          )}
        </div>
      )}

      {adding && (
        <VehicleFormModal
          initial={{
            plateNo: adding.plateNo,
            customerId: customerId ?? undefined,
          }}
          customers={customers}
          onClose={() => setAdding(null)}
          onSaved={(v) => {
            setResults((prev) => [v, ...prev.filter((x) => x.id !== v.id)]);
            onChange(v);
            setText("");
          }}
        />
      )}
    </>
  );
}
