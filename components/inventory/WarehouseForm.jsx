"use client";

import { useEffect } from "react";
import { Col, Form, Input, Row, Switch } from "antd";
import { message } from "@/components/common/feedback";
import { useTranslations } from "next-intl";
import {
  createWarehouseAction,
  updateWarehouseAction,
} from "@/actions/warehouse.actions";
import { applyFieldErrors } from "@/lib/form-errors";

const NEW_WAREHOUSE = { isMain: false, isActive: true, notes: "" };

// فورم المستودع (إضافة وتعديل)
export default function WarehouseForm({
  formId,
  warehouse = null,
  onSuccess,
  setLoading,
}) {
  const [form] = Form.useForm();
  const isEdit = Boolean(warehouse);
  const t = useTranslations("Inventory");
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");
  const isMain = Form.useWatch("isMain", form);

  useEffect(() => {
    form.setFieldsValue(
      warehouse
        ? { ...warehouse, notes: warehouse.notes ?? "" }
        : NEW_WAREHOUSE,
    );
  }, [warehouse, form]);

  const onFinish = async (values) => {
    setLoading?.(true);
    const res = isEdit
      ? await updateWarehouseAction({ ...values, id: warehouse.id })
      : await createWarehouseAction(values);
    setLoading?.(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }
    message.success(tAlerts(isEdit ? "WarehouseUpdated" : "WarehouseAdded"));
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
      initialValues={warehouse ?? NEW_WAREHOUSE}
      requiredMark={false}
      style={{ padding: "10px 10px 0" }}
    >
      <Row gutter={[12, 0]}>
        <Col xs={24} sm={12}>
          <Form.Item name="arName" label={tForm("ArName")} rules={nameRules}>
            <Input placeholder="مستودع الخبر" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="enName" label={tForm("EnName")} rules={nameRules}>
            <Input dir="ltr" placeholder="Khobar Warehouse" />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item name="notes" label={t("Notes")}>
            <Input maxLength={255} />
          </Form.Item>
        </Col>
        <Col xs={12}>
          <Form.Item
            name="isMain"
            label={t("MainWarehouse")}
            tooltip={t("MainWarehouseHint")}
            valuePropName="checked"
          >
            <Switch disabled={warehouse?.isMain} />
          </Form.Item>
        </Col>
        <Col xs={12}>
          <Form.Item
            name="isActive"
            label={tForm("Active")}
            valuePropName="checked"
          >
            <Switch disabled={isMain} />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
}
