"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Space,
  Tag,
} from "antd";
import { NumberOutlined, SearchOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import DayPicker from "@/components/common/DayPicker";
import QuickAddParty from "@/components/parties/QuickAddParty";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { applyFieldErrors } from "@/lib/form-errors";
import { useRouter } from "@/i18n/routing";
import { saleDocNo } from "@/lib/doc-number";
import { formatDate, today } from "@/lib/dates";
import { CLAIM_ACCESSORIES } from "@/validations/warranty-claim.schema";
import {
  createClaimAction,
  lookupDeviceAction,
} from "@/actions/warranty-claim.actions";
import WarrantyBadge from "@/components/serials/WarrantyBadge";
import { C } from "@/lib/theme";

// ============================================================
// استلام جهاز (طلب ضمان / صيانة جديد)
// 1) الرقم التسلسلي ← الصنف والعميل والفاتورة والضمان لوحدهم
//    (مش لاقيه: جهاز مش من عندنا ← اسم الجهاز بإيدك، وصيانة مدفوعة)
// 2) العطل والملحقات والحالة وموعد التسليم
// ============================================================
export default function ClaimForm({ customers: customersProp = [] }) {
  const t = useTranslations("Claims");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [form] = Form.useForm();
  const [added, setAdded] = useState([]);
  const customers = useMemo(() => {
    const ids = new Set(customersProp.map((c) => c.id));
    return [...customersProp, ...added.filter((c) => !ids.has(c.id))];
  }, [customersProp, added]);

  const [serialText, setSerialText] = useState("");
  const [device, setDevice] = useState(null); // نتيجة البحث بالرقم
  const [searched, setSearched] = useState(false);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const customerId = Form.useWatch("customerId", form);

  const lookup = async () => {
    const q = serialText.trim();
    // جهاز من غير رقم: نكمل ببيانات مكتوبة
    if (!q) {
      setSearched(true);
      setDevice(null);
      form.setFieldsValue({ kind: "paid" });
      return;
    }
    setLooking(true);
    const res = await lookupDeviceAction(q);
    setLooking(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    setSearched(true);
    setDevice(res.data);
    if (res.data) {
      form.setFieldsValue({
        kind: res.data.inWarranty ? "warranty" : "paid",
        customerId: res.data.customer?.id ?? undefined,
        customerPhone: res.data.customer?.phone ?? undefined,
      });
    } else {
      form.setFieldsValue({ kind: "paid" });
    }
  };

  const save = async (v) => {
    setSaving(true);
    const res = await createClaimAction({
      kind: v.kind,
      serialId: device?.serialId,
      serialText: device ? undefined : serialText.trim() || null,
      serial2Text: device ? undefined : v.serial2Text || null,
      deviceName: device ? undefined : v.deviceName,
      customerId: v.customerId ?? null,
      customerName: v.customerId ? null : v.customerName,
      customerPhone: v.customerPhone,
      fault: v.fault,
      accessories: v.accessories ?? [],
      accessoriesOther: v.accessoriesOther,
      condition: v.condition,
      expectedAt: v.expectedAt ?? null,
      estimate: v.kind === "paid" ? (v.estimate ?? null) : null,
      notes: v.notes,
    });
    setSaving(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("Created", { number: `WC-${res.data.number}` }));
    router.push(`/warranty-claims/${res.data.id}?print=1`);
    // الشاشة ترجع فاضية لطلب جديد (Next بيحتفظ بها في الخلفية)
    form.resetFields();
    setSerialText("");
    setDevice(null);
    setSearched(false);
  };

  const kind = Form.useWatch("kind", form);
  const req = [{ required: true, message: tAlerts("RequiredField") }];

  return (
    <>
      <PageHeader title={t("NewTitle")} subtitle={t("NewSubtitle")} />

      {/* ---------- الجهاز ---------- */}
      <Card size="small" title={t("Device")} className="mb-3">
        <Space.Compact style={{ width: "100%", maxWidth: 560 }}>
          <Input
            size="large"
            autoFocus
            allowClear
            prefix={<NumberOutlined style={{ color: C.muted }} />}
            placeholder={t("SerialPlaceholder")}
            value={serialText}
            onChange={(e) => {
              setSerialText(e.target.value);
              setSearched(false);
              setDevice(null);
            }}
            onPressEnter={lookup}
          />
          <Button
            size="large"
            type="primary"
            icon={<SearchOutlined />}
            loading={looking}
            onClick={lookup}
          >
            {t("Lookup")}
          </Button>
        </Space.Compact>

        <div style={{ fontSize: 12, color: C.muted }} className="mt-1">
          {t("SerialHint")}
        </div>
        {searched && device && (
          <Alert
            className="mt-3"
            type={device.inWarranty ? "success" : "warning"}
            showIcon
            title={
              <Space wrap>
                <b>{nm(device.product)}</b>
                <bdi style={{ color: C.muted }}>{device.product.code}</bdi>
                {device.sale && (
                  <span>
                    {t("SoldBy")}{" "}
                    <bdi>{saleDocNo("sale", device.sale.number, device.sale.docCode)}</bdi> —{" "}
                    <bdi>{formatDate(device.sale.date)}</bdi>
                  </span>
                )}
                {device.status === "sold" ? (
                  <WarrantyBadge endsAt={device.warrantyEndsAt} />
                ) : (
                  <Tag>{t("NotSoldPiece")}</Tag>
                )}
              </Space>
            }
          />
        )}
        {searched && !device && (
          <Alert
            className="mt-3"
            type="info"
            showIcon
            title={t("NotOurDevice")}
          />
        )}
      </Card>

      {/* ---------- البيانات ---------- */}
      <Form
        form={form}
        layout="vertical"
        onFinish={save}
        initialValues={{ kind: "paid", accessories: [] }}
        disabled={!searched}
      >
        <Card size="small" className="mb-3">
          <Row gutter={[12, 0]}>
            <Col xs={24} md={8}>
              <Form.Item name="kind" label={t("Kind")}>
                <Radio.Group
                  optionType="button"
                  buttonStyle="solid"
                  options={["warranty", "paid"].map((k) => ({
                    value: k,
                    label: t(`Kind_${k}`),
                  }))}
                />
              </Form.Item>
            </Col>
            {searched && !device && (
              <>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="deviceName"
                    label={t("DeviceName")}
                    rules={req}
                  >
                    <Input placeholder={t("DeviceNamePlaceholder")} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="serial2Text" label={t("Serial2")}>
                    <Input />
                  </Form.Item>
                </Col>
              </>
            )}
          </Row>

          <Row gutter={[12, 0]}>
            <Col xs={24} md={10}>
              <Form.Item label={t("Customer")}>
                <Space.Compact style={{ width: "100%" }}>
                  <Form.Item name="customerId" noStyle>
                    <Select
                      showSearch
                      allowClear
                      optionFilterProp="label"
                      placeholder={t("CustomerUnregistered")}
                      style={{ width: "100%" }}
                      onChange={(id) => {
                        const c = customers.find((x) => x.id === id);
                        if (c?.phone)
                          form.setFieldValue("customerPhone", c.phone);
                      }}
                      options={customers.map((c) => ({
                        value: c.id,
                        label: `${c.code} - ${nm(c)}${c.phone ? ` (${c.phone})` : ""}`,
                      }))}
                    />
                  </Form.Item>
                  <QuickAddParty
                    kind="customers"
                    onCreated={(c) => {
                      setAdded((p) => [...p, c]);
                      form.setFieldsValue({
                        customerId: c.id,
                        customerPhone: c.phone ?? undefined,
                      });
                    }}
                  />
                </Space.Compact>
              </Form.Item>
            </Col>
            {!customerId && (
              <Col xs={24} md={7}>
                <Form.Item
                  name="customerName"
                  label={t("CustomerName")}
                  rules={req}
                >
                  <Input />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} md={7}>
              <Form.Item name="customerPhone" label={t("Phone")} rules={req}>
                <Input dir="ltr" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="fault" label={t("Fault")} rules={req}>
            <Input.TextArea rows={2} maxLength={1000} showCount />
          </Form.Item>

          <Row gutter={[12, 0]}>
            <Col xs={24} md={14}>
              <Form.Item name="accessories" label={t("Accessories")}>
                <Checkbox.Group
                  options={CLAIM_ACCESSORIES.map((a) => ({
                    value: a,
                    label: t(`Acc_${a}`),
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item name="accessoriesOther" label={t("AccessoriesOther")}>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[12, 0]}>
            <Col xs={24} md={10}>
              <Form.Item name="condition" label={t("Condition")}>
                <Input placeholder={t("ConditionPlaceholder")} />
              </Form.Item>
            </Col>
            <Col xs={12} md={7}>
              <Form.Item name="expectedAt" label={t("ExpectedAt")}>
                <DayPicker allowClear min={today()} />
              </Form.Item>
            </Col>
            {kind === "paid" && (
              <Col xs={12} md={7}>
                <Form.Item
                  name="estimate"
                  label={t("Estimate")}
                  tooltip={t("EstimateHint")}
                >
                  <InputNumber min={0} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            )}
          </Row>

          <Form.Item name="notes" label={t("Notes")}>
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>

          <Button
            type="primary"
            size="large"
            htmlType="submit"
            loading={saving}
            disabled={!searched}
          >
            {t("Receive")}
          </Button>
        </Card>
      </Form>
    </>
  );
}
