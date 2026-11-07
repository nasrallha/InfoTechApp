"use client";

import { useState } from "react";
import { Checkbox, Form, Input, InputNumber, Modal, Radio } from "antd";
import { useLocale, useTranslations } from "next-intl";
import DayPicker from "@/components/common/DayPicker";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { applyFieldErrors } from "@/lib/form-errors";
import { CLAIM_ACCESSORIES } from "@/validations/warranty-claim.schema";
import { updateClaimAction } from "@/actions/warranty-claim.actions";

// تعديل بيانات طلب الضمان / الصيانة (قبل التسليم)
export default function ClaimEditModal({ claim: c, onClose }) {
  const t = useTranslations("Claims");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const kind = Form.useWatch("kind", form) ?? c.kind;
  const req = [{ required: true, message: tAlerts("RequiredField") }];

  const save = async (v) => {
    setSaving(true);
    const res = await updateClaimAction({
      id: c.id,
      ...v,
      estimate: v.kind === "paid" ? (v.estimate ?? null) : null,
      expectedAt: v.expectedAt ?? null,
    });
    setSaving(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("Updated"));
    onClose();
  };

  return (
    <Modal
      open
      width={640}
      title={t("Edit")}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={save}
        initialValues={{
          kind: c.kind,
          customerName: c.customerName ?? undefined,
          customerPhone: c.customerPhone ?? c.customer?.phone ?? undefined,
          fault: c.fault,
          accessories: c.accessories ?? [],
          accessoriesOther: c.accessoriesOther ?? undefined,
          condition: c.condition ?? undefined,
          expectedAt: c.expectedAt ?? undefined,
          estimate: c.estimate ?? undefined,
          notes: c.notes ?? undefined,
        }}
      >
        <Form.Item name="kind" label={t("Kind")}>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={["warranty", "paid"].map((k) => ({
              value: k,
              label: t(`Kind_${k}`),
            }))}
          />
        </Form.Item>
        {!c.customerId && (
          <Form.Item name="customerName" label={t("CustomerName")} rules={req}>
            <Input />
          </Form.Item>
        )}
        <Form.Item name="customerPhone" label={t("Phone")}>
          <Input dir="ltr" />
        </Form.Item>
        <Form.Item name="fault" label={t("Fault")} rules={req}>
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
        <Form.Item name="accessories" label={t("Accessories")}>
          <Checkbox.Group
            options={CLAIM_ACCESSORIES.map((a) => ({
              value: a,
              label: t(`Acc_${a}`),
            }))}
          />
        </Form.Item>
        <Form.Item name="accessoriesOther" label={t("AccessoriesOther")}>
          <Input />
        </Form.Item>
        <Form.Item name="condition" label={t("Condition")}>
          <Input />
        </Form.Item>
        <Form.Item name="expectedAt" label={t("ExpectedAt")}>
          <DayPicker allowClear />
        </Form.Item>
        {kind === "paid" && (
          <Form.Item name="estimate" label={t("Estimate")}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        )}
        <Form.Item name="notes" label={t("Notes")}>
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
