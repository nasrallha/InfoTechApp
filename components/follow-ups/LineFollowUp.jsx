"use client";

import { useState } from "react";
import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Space,
  Tag,
} from "antd";
import {
  AimOutlined,
  EnvironmentOutlined,
  PlusOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { useModule } from "@/components/auth/AuthProvider";
import { message } from "@/components/common/feedback";

// لينك خرائط جوجل من إحداثيات
export const mapsUrl = (lat, lng) =>
  `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

// زرار "موقعي الحالي": الموقع من المتصفح (الموبايل عند العميل) ← لينك خرائط
export function useCurrentLocation() {
  const t = useTranslations("FollowUps");
  const [busy, setBusy] = useState(false);
  const locate = (onDone) => {
    if (typeof navigator === "undefined" || !navigator.geolocation)
      return message.error(t("NoGeolocation"));
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onDone(mapsUrl(pos.coords.latitude, pos.coords.longitude));
      },
      () => {
        setBusy(false);
        message.error(t("LocationDenied"));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  return { busy, locate };
}

// ============================================================
// المتابعة الدورية لسطر صنف عليه متابعة في فاتورة البيع (وحدة followUps)
// اختيارية: "+ متابعة" ← نافذة (كل كام يوم، المكان، العنوان، اللوكيشن، الجوال)
// line: { followUpDays, followUp, arName ... }
// customer: العميل المختار (الجوال الافتراضي)
// onChange({ followUp })  (null = بدون متابعة)
// ============================================================
export default function LineFollowUp({ line, customer, onChange, disabled }) {
  const t = useTranslations("FollowUps");
  const on = useModule("followUps");
  const [open, setOpen] = useState(false);
  if (!on || !(line.followUpDays > 0)) return null;
  const f = line.followUp;

  return (
    <div className="mt-1">
      <Tag
        color={f ? "green" : "default"}
        icon={f ? <SyncOutlined /> : <PlusOutlined />}
        style={{ cursor: disabled ? "default" : "pointer" }}
        onClick={disabled ? undefined : () => setOpen(true)}
      >
        {f
          ? [t("EveryNDays", { n: f.intervalDays }), f.place]
              .filter(Boolean)
              .join(" — ")
          : t("AddFollowUp")}
      </Tag>
      {open && (
        <FollowUpModal
          value={f}
          defaults={{
            intervalDays: line.followUpDays,
            phone: customer?.phone ?? "",
          }}
          onClose={() => setOpen(false)}
          onSave={(v) => {
            onChange?.({ followUp: v });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

// النافذة نفسها (بتتستخدم كمان في تعديل المتابعة من شاشة المتابعات)
export function FollowUpModal({
  value,
  defaults = {},
  onClose,
  onSave,
  title,
  allowRemove = true,
  saving = false,
}) {
  const t = useTranslations("FollowUps");
  const tAlerts = useTranslations("Alerts");
  const [form] = Form.useForm();
  const { busy, locate } = useCurrentLocation();
  const url = Form.useWatch("locationUrl", form);

  const submit = (v) =>
    onSave({
      ...(value?.id ? { id: value.id } : {}),
      intervalDays: v.intervalDays,
      place: v.place?.trim() || null,
      address: v.address?.trim() || null,
      locationUrl: v.locationUrl?.trim() || null,
      phone: v.phone?.trim() || null,
      notes: v.notes?.trim() || null,
    });

  return (
    <Modal
      open
      width={640}
      title={title ?? t("ModalTitle")}
      onCancel={onClose}
      destroyOnHidden
      footer={
        <Space wrap>
          {allowRemove && value && (
            <Button danger onClick={() => onSave(null)}>
              {t("NoFollowUp")}
            </Button>
          )}
          <Button onClick={onClose}>{t("Close")}</Button>
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            {t("Save")}
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={submit}
        initialValues={{
          intervalDays: value?.intervalDays ?? defaults.intervalDays ?? 90,
          place: value?.place ?? "",
          address: value?.address ?? "",
          locationUrl: value?.locationUrl ?? "",
          phone: value?.phone ?? defaults.phone ?? "",
          notes: value?.notes ?? "",
        }}
      >
        <Row gutter={12}>
          <Col xs={12} md={8}>
            <Form.Item
              name="intervalDays"
              label={t("Every")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <InputNumber
                min={1}
                max={3650}
                precision={0}
                suffix={t("Days")}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="place" label={t("Place")}>
              <Input maxLength={100} placeholder={t("PlacePlaceholder")} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="phone" label={t("Phone")}>
              <Input dir="ltr" maxLength={30} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="address" label={t("Address")}>
          <Input maxLength={500} placeholder={t("AddressPlaceholder")} />
        </Form.Item>
        <Form.Item label={t("Location")} extra={t("LocationHint")}>
          <Space.Compact style={{ width: "100%" }}>
            <Form.Item name="locationUrl" noStyle>
              <Input
                dir="ltr"
                maxLength={500}
                placeholder="https://maps.google.com/..."
              />
            </Form.Item>
            <Button
              icon={<AimOutlined />}
              loading={busy}
              onClick={() =>
                locate((link) => form.setFieldValue("locationUrl", link))
              }
            >
              {t("MyLocation")}
            </Button>
            {url && (
              <Button
                icon={<EnvironmentOutlined />}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={t("OpenMap")}
              />
            )}
          </Space.Compact>
        </Form.Item>
        <Form.Item name="notes" label={t("Notes")}>
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
