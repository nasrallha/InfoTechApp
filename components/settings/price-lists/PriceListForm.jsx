"use client";

import { useEffect } from "react";
import { Col, Form, Input, Row, Switch } from "antd";
import { message } from "@/components/common/feedback";
import { useTranslations } from "next-intl";
import {
  createPriceListAction,
  updatePriceListAction,
} from "@/actions/price-list.actions";
import { applyFieldErrors } from "@/lib/form-errors";

const NEW_LIST = { isActive: true, notes: "" };

// فورم قائمة الأسعار (إضافة وتعديل)
export default function PriceListForm({
  formId,
  priceList = null,
  onSuccess,
  setLoading,
}) {
  const [form] = Form.useForm();
  const isEdit = Boolean(priceList);
  const t = useTranslations("PriceLists");
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");

  useEffect(() => {
    form.setFieldsValue(
      priceList ? { ...priceList, notes: priceList.notes ?? "" } : NEW_LIST,
    );
  }, [priceList, form]);

  const onFinish = async (values) => {
    setLoading?.(true);
    const res = isEdit
      ? await updatePriceListAction({ ...values, id: priceList.id })
      : await createPriceListAction(values);
    setLoading?.(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }
    message.success(tAlerts(isEdit ? "PriceListUpdated" : "PriceListAdded"));
    if (!isEdit) form.resetFields();
    onSuccess?.();
  };

  const nameRules = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
    { min: 3, message: tAlerts("MinCharcters") },
    { max: 100, message: tAlerts("TextTooLong") },
  ];

  return (
    <Form
      form={form}
      id={formId}
      layout="vertical"
      autoComplete="off"
      onFinish={onFinish}
      initialValues={priceList ?? NEW_LIST}
      requiredMark={false}
      style={{ padding: "10px 10px 0" }}
    >
      <Row gutter={[12, 0]}>
        <Col xs={24} sm={12}>
          <Form.Item name="arName" label={tForm("ArName")} rules={nameRules}>
            <Input placeholder="أسعار الأحساء" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="enName" label={tForm("EnName")} rules={nameRules}>
            <Input dir="ltr" placeholder="Al-Ahsa Prices" />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item name="notes" label={t("Notes")}>
            <Input maxLength={255} />
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
