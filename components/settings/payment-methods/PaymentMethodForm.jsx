"use client";

import { useEffect } from "react";
import { Col, Form, Input, InputNumber, Row, Select, Switch } from "antd";
import { message } from "@/components/common/feedback";
import { useTranslations } from "next-intl";
import {
  createPaymentMethodAction,
  updatePaymentMethodAction,
} from "@/actions/payment-method.actions";
import { PAYMENT_TYPES } from "@/validations/payment-method.schema";
import { applyFieldErrors } from "@/lib/form-errors";

const NEW_METHOD = {
  type: "card",
  requiresReference: false,
  sortOrder: 0,
  isActive: true,
};

// فورم طريقة الدفع (إضافة وتعديل)
// method: في التعديل (أو null في الإضافة)، onSuccess/setLoading من FormModal
export default function PaymentMethodForm({
  formId,
  method = null,
  onSuccess,
  setLoading,
}) {
  const [form] = Form.useForm();
  const isEdit = Boolean(method);
  const t = useTranslations("PaymentMethods");
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");

  useEffect(() => {
    form.setFieldsValue(method ?? NEW_METHOD);
  }, [method, form]);

  const onFinish = async (values) => {
    setLoading?.(true);
    const res = isEdit
      ? await updatePaymentMethodAction({ ...values, id: method.id })
      : await createPaymentMethodAction(values);
    setLoading?.(false);

    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }
    message.success(
      tAlerts(isEdit ? "PaymentMethodUpdated" : "PaymentMethodAdded"),
    );
    if (!isEdit) form.resetFields();
    onSuccess?.();
  };

  const nameRules = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
    { min: 2, message: tAlerts("MinCharcters") },
    { max: 50, message: tAlerts("TextTooLong") },
  ];

  return (
    <Form
      form={form}
      id={formId}
      layout="vertical"
      autoComplete="off"
      onFinish={onFinish}
      initialValues={method ?? NEW_METHOD}
      requiredMark={false}
      style={{ padding: "10px 10px 0" }}
    >
      <Row gutter={[12, 0]}>
        <Col xs={24} sm={12}>
          <Form.Item name="arName" label={tForm("ArName")} rules={nameRules}>
            <Input placeholder="مدى" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="enName" label={tForm("EnName")} rules={nameRules}>
            <Input dir="ltr" placeholder="Mada" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name="type"
            label={t("Type")}
            tooltip={t("TypeHint")}
            rules={[{ required: true, message: tAlerts("RequiredField") }]}
          >
            <Select
              options={PAYMENT_TYPES.map((v) => ({
                value: v,
                label: t(`types.${v}`),
              }))}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name="sortOrder"
            label={t("SortOrder")}
            tooltip={t("SortOrderHint")}
            rules={[{ required: true, message: tAlerts("RequiredField") }]}
          >
            <InputNumber
              min={0}
              max={999}
              precision={0}
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Col>
        <Col xs={12}>
          <Form.Item
            name="requiresReference"
            label={t("RequiresReference")}
            tooltip={t("RequiresReferenceHint")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
        <Col xs={12}>
          <Form.Item
            name="isActive"
            label={tForm("Active")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
}
