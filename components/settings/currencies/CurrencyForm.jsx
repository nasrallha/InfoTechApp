"use client";

import { useEffect } from "react";
import { Col, Form, Input, InputNumber, Row, Switch } from "antd";
import { message } from "@/components/common/feedback";
import { useTranslations } from "next-intl";
import {
  createCurrencyAction,
  updateCurrencyAction,
} from "@/actions/currency.actions";
import { applyFieldErrors } from "@/lib/form-errors";

const NEW_CURRENCY = { decimals: 2, isActive: true };

// فورم العملة (إضافة وتعديل)
// currency: في التعديل (أو null في الإضافة)، onSuccess/setLoading من FormModal
export default function CurrencyForm({ formId, currency = null, onSuccess, setLoading }) {
  const [form] = Form.useForm();
  const isEdit = Boolean(currency);
  const t = useTranslations("Currencies");
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");

  useEffect(() => {
    form.setFieldsValue(currency ?? NEW_CURRENCY);
  }, [currency, form]);

  const onFinish = async (values) => {
    setLoading?.(true);
    const res = isEdit
      ? await updateCurrencyAction({ ...values, id: currency.id })
      : await createCurrencyAction(values);
    setLoading?.(false);

    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }
    message.success(tAlerts(isEdit ? "CurrencyUpdated" : "CurrencyAdded"));
    if (!isEdit) form.resetFields();
    onSuccess?.();
  };

  const required = { required: true, whitespace: true, message: tAlerts("RequiredField") };
  const nameRules = [
    required,
    { min: 3, message: tAlerts("MinCharcters") },
    { max: 50, message: tAlerts("TextTooLong") },
  ];

  return (
    <Form
      form={form}
      id={formId}
      layout="vertical"
      autoComplete="off"
      onFinish={onFinish}
      initialValues={currency ?? NEW_CURRENCY}
      requiredMark={false}
      style={{ padding: "10px 10px 0" }}
    >
      <Row gutter={[12, 0]}>
        <Col xs={12}>
          <Form.Item
            name="code"
            label={t("Code")}
            tooltip={t("CodeHint")}
            normalize={(v) => v?.toUpperCase()}
            rules={[
              required,
              { pattern: /^[A-Za-z]{3}$/, message: tAlerts("CurrencyCodeInvalid") },
            ]}
          >
            <Input maxLength={3} dir="ltr" placeholder="SAR" />
          </Form.Item>
        </Col>
        <Col xs={12}>
          <Form.Item
            name="decimals"
            label={t("Decimals")}
            tooltip={t("DecimalsHint")}
            rules={[{ required: true, message: tAlerts("RequiredField") }]}
          >
            <InputNumber min={0} max={3} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="arName" label={tForm("ArName")} rules={nameRules}>
            <Input placeholder="ريال سعودي" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="enName" label={tForm("EnName")} rules={nameRules}>
            <Input dir="ltr" placeholder="Saudi Riyal" />
          </Form.Item>
        </Col>
        <Col xs={12}>
          <Form.Item
            name="arSymbol"
            label={t("ArSymbol")}
            rules={[required, { max: 10, message: tAlerts("TextTooLong") }]}
          >
            <Input placeholder="ر.س" />
          </Form.Item>
        </Col>
        <Col xs={12}>
          <Form.Item
            name="enSymbol"
            label={t("EnSymbol")}
            rules={[required, { max: 10, message: tAlerts("TextTooLong") }]}
          >
            <Input dir="ltr" placeholder="SAR" />
          </Form.Item>
        </Col>
        <Col xs={12}>
          <Form.Item name="isActive" label={tForm("Active")} valuePropName="checked">
            <Switch disabled={currency?.isBase} />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
}
