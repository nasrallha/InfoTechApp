"use client";

import { useState } from "react";
import { Button, Input } from "antd";
import { FormOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";

export const LINE_NOTE_MAX = 500;

// ============================================================
// ملاحظة / وصف لسطر الصنف في الفاتورة (مبيعات، عرض سعر، مشتريات)
// - زرار صغير "إضافة ملاحظة" تحت الصنف، ولما يتداس يظهر مكان الكتابة
// - لو السطر عليه ملاحظة: مكان الكتابة ظاهر على طول
// - الملاحظة بتتحفظ مع السطر وبتظهر في الطباعة تحت اسم الصنف
// ============================================================
export function LineNoteEditor({ value, onChange, disabled }) {
  const t = useTranslations("Purchases");
  const [open, setOpen] = useState(Boolean(value));

  if (!open && !value) {
    return (
      <Button
        type="link"
        size="small"
        className="line-note__add"
        icon={<FormOutlined />}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {t("LineNoteAdd")}
      </Button>
    );
  }
  return (
    <Input.TextArea
      className="line-note__input"
      size="small"
      autoFocus={!value}
      autoSize={{ minRows: 1, maxRows: 4 }}
      maxLength={LINE_NOTE_MAX}
      placeholder={t("LineNotePlaceholder")}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      // فاضية وخرج منها: ترجع زرار "إضافة ملاحظة"
      onBlur={() => !(value ?? "").trim() && setOpen(false)}
    />
  );
}

// عرض الملاحظة بس (المرتجعات وصفحة المستند)
export function LineNoteText({ note }) {
  if (!note) return null;
  return (
    <div className="line-note">
      <FormOutlined /> {note}
    </div>
  );
}
