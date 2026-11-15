"use client";

import { useState } from "react";
import { Button, Modal, Segmented, Space } from "antd";
import { AppstoreOutlined, CloseOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { LIBRARY_CATEGORIES, TAILOR_LIBRARY } from "@/lib/tailor-library";
import "./tailoring.css";

// ============================================================
// اختيار صورة الشكل من مكتبة الرسومات (رقبات / جبزور / كبك / جيوب ...)
// value: مسار الصورة المختارة (/tailoring/lib/...) أو فاضي | onChange(path)
// category: النوع اللي بيتفتح عليه أول مرة (حسب شكله على الثوب)
// ============================================================
export default function LibraryPicker({ value, onChange, category }) {
  const t = useTranslations("Tailoring");
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState(
    LIBRARY_CATEGORIES.includes(category) ? category : LIBRARY_CATEGORIES[0],
  );

  return (
    <div>
      <Space wrap align="center">
        <Button
          icon={<AppstoreOutlined />}
          onClick={() => {
            if (LIBRARY_CATEGORIES.includes(category)) setCat(category);
            setOpen(true);
          }}
        >
          {t("PickFromLibrary")}
        </Button>
        {value && (
          <span className="tailor-libpick">
            <img src={value} alt="" />
            <Button
              size="small"
              type="text"
              danger
              icon={<CloseOutlined />}
              onClick={() => onChange?.(null)}
            />
          </span>
        )}
      </Space>
      <Modal
        open={open}
        title={t("DrawingsLibrary")}
        onCancel={() => setOpen(false)}
        footer={null}
        width={860}
        destroyOnHidden
      >
        <Segmented
          className="mb-3"
          value={cat}
          onChange={setCat}
          options={LIBRARY_CATEGORIES.map((c) => ({
            value: c,
            label: t(`lib_${c}`),
          }))}
        />
        <div className="tailor-lib-grid">
          {TAILOR_LIBRARY[cat].map((src) => (
            <button
              type="button"
              key={src}
              className={`tailor-lib-item${value === src ? " tailor-lib-item--on" : ""}`}
              onClick={() => {
                onChange?.(src);
                setOpen(false);
              }}
            >
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
