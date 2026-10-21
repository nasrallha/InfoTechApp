"use client";
import { Input, Form, Switch } from "antd";

// حقول فورم الوحدة (مشتركة بين الإضافة والتعديل)
export default function UnitFormFields({ tForm, tAlerts }) {
  const nameRules = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
    { min: 3, message: tAlerts("MinCharcters") },
    { max: 50, message: tAlerts("MaxCharacters") },
  ];

  return (
    <>
      <Form.Item label={tForm("ArName")} name="arName" hasFeedback rules={nameRules}>
        <Input />
      </Form.Item>

      <Form.Item label={tForm("EnName")} name="enName" hasFeedback rules={nameRules}>
        <Input />
      </Form.Item>

      <Form.Item name="isActive" label={tForm("Active")} valuePropName="checked">
        <Switch />
      </Form.Item>

      <hr />
    </>
  );
}
