"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Col,
  Form,
  InputNumber,
  Row,
  Switch,
  TimePicker,
} from "antd";
import { SaveOutlined, SendOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { saveZatcaSettingsAction } from "@/actions/zatca.actions";
import { showZatcaError } from "./zatcaUi";

// ============================================================
// إعدادات إرسال الفواتير الإلكترونية والتنبيهات
// ============================================================
export default function ZatcaSettingsCard({ settings, canEdit }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const locale = useLocale();
  const t = useTranslations("Zatca");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const autoSend = Form.useWatch("autoSend", form) ?? settings.autoSend;

  const save = async (v) => {
    setSaving(true);
    const res = await saveZatcaSettingsAction({
      sendOnSave: Boolean(v.sendOnSave),
      autoSend: Boolean(v.autoSend),
      intervalMinutes: Number(v.intervalMinutes),
      alertTime: v.alertTime ? v.alertTime.format("HH:mm") : "22:00",
      alertThreshold: Number(v.alertThreshold),
    });
    setSaving(false);
    if (!res.success) return showZatcaError(res, { t, tAlerts, locale });
    message.success(tAlerts("SettingsSaved"));
  };

  return (
    <Card
      size="small"
      className="mb-4"
      title={
        <span>
          <SendOutlined /> {t("SendSettings")}
        </span>
      }
    >
      <Form
        form={form}
        layout="vertical"
        disabled={!canEdit}
        onFinish={save}
        initialValues={{
          ...settings,
          alertTime: dayjs(`2000-01-01T${settings.alertTime}:00`),
        }}
      >
        <Row gutter={[16, 0]}>
          <Col xs={24} md={12}>
            <Form.Item
              name="sendOnSave"
              valuePropName="checked"
              label={t("SendOnSave")}
              extra={t("SendOnSaveHint")}
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="autoSend"
              valuePropName="checked"
              label={t("AutoSend")}
              extra={t("AutoSendHint")}
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="intervalMinutes"
              label={t("IntervalMinutes")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <InputNumber
                min={1}
                max={240}
                disabled={!autoSend}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="alertTime"
              label={t("AlertTime")}
              tooltip={t("AlertTimeHint")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <TimePicker
                format="HH:mm"
                style={{ width: "100%" }}
                allowClear={false}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="alertThreshold"
              label={t("AlertThreshold")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <InputNumber min={1} max={100000} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
        {canEdit && (
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={saving}
          >
            {tButtons("Save")}
          </Button>
        )}
      </Form>
    </Card>
  );
}
