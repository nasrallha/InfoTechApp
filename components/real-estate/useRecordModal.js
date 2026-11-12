"use client";

import { useState } from "react";
import { Form } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";

// ============================================================
// نافذة إضافة / تعديل سجل (المالك / العقار / الوحدة / النموذج)
// - open(row): فاضي = جديد، غير كده تعديل (initial: قيم الفورم)
// - save: بيبعت للـ action ويحط أخطاء الحقول تحتها
// - remove(id): حذف برسالة
// ============================================================
export function useRecordModal({ saveAction, deleteAction, toForm, fromForm }) {
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(null); // null | {} | row
  const [saving, setSaving] = useState(false);
  const locale = useLocale();
  const t = useTranslations("RealEstate");
  const tAlerts = useTranslations("Alerts");

  const open = (row) => {
    setEditing(row ?? {});
    form.resetFields();
    form.setFieldsValue(toForm(row ?? null));
  };
  const close = () => setEditing(null);

  const save = async (values) => {
    setSaving(true);
    const res = await saveAction({
      ...(fromForm ? fromForm(values) : values),
      ...(editing?.id ? { id: editing.id } : {}),
    });
    setSaving(false);
    if (!res.success) {
      if (res.fieldErrors)
        form.setFields(
          Object.entries(res.fieldErrors).map(([name, code]) => ({
            name: name.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p)),
            errors: [tAlerts.has(code) ? tAlerts(code) : code],
          })),
        );
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("Saved"));
    setEditing(null);
  };

  const remove = async (id) => {
    const res = await deleteAction(id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Deleted"));
  };

  return { form, editing, saving, open, close, save, remove };
}
