"use client";

import { useState } from "react";
import { Button, Modal, Radio, Tag } from "antd";
import { SyncOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { formatDay, today } from "@/lib/dates";
import { C } from "@/lib/theme";

// ============================================================
// وقت حفظ فاتورة لعميل عنده متابعات: علاقة الفاتورة بكل متابعة
// - none: لا علاقة لها بالفاتورة (حنفية، خرطوم، جهاز تاني...)
// - log: تسجيل في السجل فقط (صيانة طارئة، الميعاد يفضل زي ما هو)
// - renew: تسجيل وتجديد (الميعاد = تاريخ الفاتورة + كل كام يوم)
// list: متابعات العميل الشغالة، preselected: (من "فاتورة صيانة" ← تجديد)
// onDone({ renew: [ids], log: [ids] }) / onDone(null) = رجوع للفاتورة
// ============================================================
export default function RenewFollowUpsModal({
  list,
  preselected = [],
  onDone,
}) {
  const t = useTranslations("FollowUps");
  const [choice, setChoice] = useState(() =>
    Object.fromEntries(
      list.map((f) => [f.id, preselected.includes(f.id) ? "renew" : "none"]),
    ),
  );
  const todayDay = today();
  const pick = (kind) =>
    list.filter((f) => choice[f.id] === kind).map((f) => f.id);

  return (
    <Modal
      open
      width={620}
      title={
        <span>
          <SyncOutlined /> {t("RenewTitle")}
        </span>
      }
      onCancel={() => onDone(null)}
      destroyOnHidden
      footer={
        <Button
          type="primary"
          size="large"
          onClick={() => onDone({ renew: pick("renew"), log: pick("log") })}
        >
          {t("SaveInvoice")}
        </Button>
      }
    >
      <div className="mb-3" style={{ color: C.muted }}>
        {t("RenewHint")}
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {list.map((f) => {
          const late = f.nextDate < todayDay;
          return (
            <div
              key={f.id}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <div className="mb-2">
                <b>{f.deviceName}</b>
                {f.place && <> — {f.place}</>}{" "}
                <Tag color={late ? "red" : "blue"}>
                  {t(late ? "WasDue" : "DueOn", {
                    date: formatDay(f.nextDate),
                  })}
                </Tag>
                <span style={{ color: C.muted, fontSize: 12 }}>
                  {t("EveryNDays", { n: f.intervalDays })}
                </span>
              </div>
              <Radio.Group
                value={choice[f.id]}
                onChange={(e) =>
                  setChoice((p) => ({ ...p, [f.id]: e.target.value }))
                }
                style={{ display: "grid", gap: 4 }}
                options={[
                  { value: "none", label: t("Choice_none") },
                  { value: "log", label: t("Choice_log") },
                  {
                    value: "renew",
                    label: t("Choice_renew", { n: f.intervalDays }),
                  },
                ]}
              />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
