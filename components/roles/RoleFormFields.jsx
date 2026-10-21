"use client";
import { Input, Form, Switch } from "antd";
import { CrownFilled } from "@ant-design/icons";
import { useCurrentUser } from "@/components/auth/AuthProvider";

// حقول فورم الدور (مشتركة بين الإضافة والتعديل)
export default function RoleFormFields({ tForm, tAlerts }) {
  const currentUser = useCurrentUser();

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

      {/* مدير النظام فقط يقدر يعمل دور "مدير نظام" (كل الصلاحيات وكل الفروع) */}
      {currentUser?.isSuper && (
        <Form.Item
          name="isSuper"
          label={
            <span>
              <CrownFilled style={{ color: "#d4a017", marginInlineEnd: 6 }} />
              {tForm("IsSuperRole")}
            </span>
          }
          tooltip={tForm("IsSuperRoleHint")}
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
      )}

      <hr />
    </>
  );
}
