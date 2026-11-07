"use client";

import { useState } from "react";
import { Form, Modal } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { applyFieldErrors } from "@/lib/form-errors";

// ============================================================
// نافذة إضافة / تعديل بسيطة (الأحجام، الإضافات، السائقين...)
// save(values) ← نتيجة الـ action، ولو نجحت النافذة بتتقفل
// children: حقول الفورم (Row / Col / Form.Item)
// ============================================================
export default function EntityModal({
  title,
  initialValues,
  save,
  onClose,
  width = 600,
  children,
}) {
  const t = useTranslations("Restaurant");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const submit = async (v) => {
    setSaving(true);
    const res = await save(v);
    setSaving(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("Saved"));
    onClose();
  };

  return (
    <Modal
      open
      width={width}
      title={title}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      mask={{ closable: false }}
      destroyOnHidden
    >
      <Form
        form={form}
        preserve={false}
        layout="vertical"
        autoComplete="off"
        onFinish={submit}
        initialValues={initialValues}
      >
        {children}
      </Form>
    </Modal>
  );
}
