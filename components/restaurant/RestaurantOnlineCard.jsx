"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Space,
  Switch,
  TimePicker,
} from "antd";
import { CopyOutlined, LinkOutlined, SaveOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";
import { saveOnlineSettingsAction } from "@/actions/restaurant-online.actions";
import { C } from "@/lib/theme";

// ============================================================
// الطلب الأونلاين: لينك للعملاء (زي لينك الحجز) يطلبوا منه ويحددوا ميعاد الوصول
// - مواعيد الاستقبال (لو الإغلاق قبل الفتح يبقى بعد نص الليل)
// - وقت التحضير: أقرب ميعاد وصول = دلوقتي + الوقت ده
// - فترة المواعيد: كل كام دقيقة ميعاد
// - ملاحظة تظهر للعميل (الاستلام من المحل أو السيارة مش فارق: من غير بيانات سيارة)
// ============================================================
export default function RestaurantOnlineCard({ settings, code }) {
  const t = useTranslations("Restaurant");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const can = useCan();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  // اللينك بعد ما الصفحة تفتح (العنوان من المتصفح)
  const [origin, setOrigin] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), []);
  const link = origin ? `${origin}/${locale}/order/${code}` : "";

  const save = async (v) => {
    setSaving(true);
    const res = await saveOnlineSettingsAction({
      online: Boolean(v.online),
      open: v.open.format("HH:mm"),
      close: v.close.format("HH:mm"),
      prepMin: v.prepMin ?? 0,
      slotMin: v.slotMin ?? 15,
      curbside: Boolean(v.curbside),
      note: v.note || null,
      dineIn: Boolean(v.dineIn),
      tableMinutes: v.tableMinutes ?? 90,
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Saved"));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      message.success(t("LinkCopied"));
    } catch {
      message.warning(link);
    }
  };

  return (
    <Card size="small" title={t("OnlineTitle")} className="mb-4">
      <div style={{ color: C.muted, fontSize: 12, marginBottom: 10 }}>
        {t("OnlineHint")}
      </div>
      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
        onFinish={save}
        disabled={!can("restaurant.manage")}
        initialValues={{
          ...settings,
          open: dayjs(`2000-01-01T${settings.open}`),
          close: dayjs(`2000-01-01T${settings.close}`),
        }}
      >
        <Row gutter={12}>
          <Col xs={12} md={6}>
            <Form.Item name="online" label={t("OnlineOn")} valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="open"
              label={t("OnlineOpen")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <TimePicker format="HH:mm" minuteStep={5} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="close"
              label={t("OnlineClose")}
              tooltip={t("OnlineCloseHint")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <TimePicker format="HH:mm" minuteStep={5} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="prepMin" label={t("PrepMin")} tooltip={t("PrepMinHint")}>
              <InputNumber
                min={0}
                max={240}
                precision={0}
                suffix={t("Minutes")}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="slotMin" label={t("SlotMin")} tooltip={t("SlotMinHint")}>
              <InputNumber
                min={5}
                max={120}
                precision={0}
                suffix={t("Minutes")}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="dineIn"
              label={t("OnlineDineIn")}
              tooltip={t("OnlineDineInHint")}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="tableMinutes" label={t("TableMinutes")} tooltip={t("TableMinutesHint")}>
              <InputNumber
                min={15}
                max={600}
                precision={0}
                suffix={t("Minutes")}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="note" label={t("OnlineNote")} tooltip={t("OnlineNoteHint")}>
              <Input maxLength={500} autoComplete="off" />
            </Form.Item>
          </Col>
        </Row>
        <Space wrap className="mb-3">
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
            {t("Save")}
          </Button>
        </Space>
      </Form>
      {link && (
        <Space.Compact style={{ width: "100%" }}>
          <Input readOnly dir="ltr" value={link} prefix={<LinkOutlined />} />
          <Button icon={<CopyOutlined />} onClick={copy}>
            {t("CopyLink")}
          </Button>
          <Button href={link} target="_blank" rel="noreferrer">
            {t("OpenLink")}
          </Button>
        </Space.Compact>
      )}
    </Card>
  );
}
