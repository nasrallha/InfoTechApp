"use client";

import { useState } from "react";
import { Alert, Button, Card, Form, Input } from "antd";
import {
  CrownOutlined,
  IdcardOutlined,
  LockOutlined,
  SaveOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { applyFieldErrors } from "@/lib/form-errors";
import PageHeader from "@/components/common/PageHeader";
import { updateOwnerProfileAction } from "@/actions/owner.actions";

// ============================================================
// الإعدادات ← حساب المالك: الاسم (اللي بيظهر على المستندات)، اسم الدخول، الباسورد
// الحفظ بيحتاج الباسورد الحالي، وبيتطبّق على طول (من غير الترمينال)
// ============================================================
export default function OwnerAccountForm({ profile }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const locale = useLocale();
  const t = useTranslations("OwnerAccount");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");

  const onFinish = async (values) => {
    setSaving(true);
    const res = await updateOwnerProfileAction(values);
    setSaving(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    form.setFieldsValue({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    message.success(t("Saved"));
  };

  return (
    <>
      <PageHeader title={t("Title")} />
      <div style={{ maxWidth: 640 }}>
        <Alert type="info" showIcon className="mb-4" title={t("Hint")} />
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            username: profile.username,
            arName: profile.arName,
            enName: profile.enName,
          }}
        >
          <Card
            size="small"
            className="mb-4"
            title={
              <span>
                <IdcardOutlined /> {t("CardName")}
              </span>
            }
          >
            <Form.Item
              name="arName"
              label={t("ArName")}
              extra={t("NameHint")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <Input dir="rtl" maxLength={100} />
            </Form.Item>
            <Form.Item
              name="enName"
              label={t("EnName")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
              className="mb-0"
            >
              <Input dir="ltr" maxLength={100} />
            </Form.Item>
          </Card>

          <Card
            size="small"
            className="mb-4"
            title={
              <span>
                <CrownOutlined /> {t("CardLogin")}
              </span>
            }
          >
            <Form.Item
              name="username"
              label={t("Username")}
              extra={t("UsernameHint")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <Input dir="ltr" prefix={<UserOutlined />} maxLength={50} />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label={t("NewPassword")}
              extra={t("NewPasswordHint")}
            >
              <Input.Password
                dir="ltr"
                prefix={<LockOutlined />}
                autoComplete="new-password"
              />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label={t("ConfirmPassword")}
              dependencies={["newPassword"]}
              className="mb-0"
            >
              <Input.Password
                dir="ltr"
                prefix={<LockOutlined />}
                autoComplete="new-password"
              />
            </Form.Item>
          </Card>

          <Card
            size="small"
            className="mb-4"
            style={{ borderColor: "#faad14" }}
          >
            <Form.Item
              name="currentPassword"
              label={t("CurrentPassword")}
              extra={t("CurrentPasswordHint")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
              className="mb-0"
            >
              <Input.Password
                dir="ltr"
                prefix={<LockOutlined />}
                autoComplete="current-password"
              />
            </Form.Item>
          </Card>

          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={saving}
          >
            {tButtons("Save")}
          </Button>
        </Form>
      </div>
    </>
  );
}
