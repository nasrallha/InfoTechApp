"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCan } from "@/components/auth/AuthProvider";
import { saveRestaurantSettingsAction } from "@/actions/restaurant.actions";
import { C } from "@/lib/theme";
import RestaurantOnlineCard from "./RestaurantOnlineCard";

// ============================================================
// إعدادات المطعم (0 = مقفولة) - كل رسوم سطر في الفاتورة عليه ضريبة
// - رسوم الخدمة: النسبة الافتراضية (الكاشير يقدر يغيّرها في الفاتورة)
// - رسوم التوصيل: المبلغ الافتراضي لطلبات التوصيل
// - رسوم التبغ: نسبة على صافي أصناف التبغ (الشيشة...)
// - الكاشير: نوع الطلب الافتراضي + الطاولة الافتراضية لطلبات «طاولات»
// + التطبيقات المفعّلة (من لوحة التحكم، للعرض بس)
// ============================================================
export default function RestaurantSettingsTab({
  settings,
  channels,
  tables = [],
  branches = [],
  online,
  orderCode,
}) {
  const t = useTranslations("Restaurant");
  const tPos = useTranslations("RestaurantPos");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const can = useCan();
  const { amount: money } = useCurrency();
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const [form] = Form.useForm();
  const [posForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [posSaving, setPosSaving] = useState(false);

  // الإعدادات بتتحفظ مع بعض (الرسوم + الكاشير)، كل كارت بزرار الحفظ بتاعه
  const save = async (which) => {
    const v = { ...form.getFieldsValue(true), ...posForm.getFieldsValue(true) };
    const setBusy = which === "pos" ? setPosSaving : setSaving;
    setBusy(true);
    const res = await saveRestaurantSettingsAction({
      serviceType: v.serviceType ?? "percent",
      servicePercent: v.servicePercent ?? 0,
      serviceDineInOnly: Boolean(v.serviceDineInOnly),
      deliveryFee: v.deliveryFee ?? 0,
      tobaccoType: v.tobaccoType ?? "percent",
      tobaccoPercent: v.tobaccoPercent ?? 0,
      defaultOrderType: v.defaultOrderType ?? "takeaway",
      defaultTableId: v.defaultTableId ?? null,
    });
    setBusy(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Saved"));
  };

  const hint = (text) => (
    <div style={{ color: C.muted, fontSize: 12, marginTop: -8, marginBottom: 12 }}>
      {text}
    </div>
  );

  return (
    <div className="settings-masonry">
      <Card size="small" title={t("FeesSettings")} className="mb-4">
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
          initialValues={settings}
          onFinish={() => save("fees")}
          disabled={!can("restaurant.manage")}
        >
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <FeeField
                name="service"
                label={t("ServicePercent")}
                hint={t("ServicePercentHint")}
              />
            </Col>
            <Col xs={12} md={8}>
              <Form.Item
                name="serviceDineInOnly"
                label={t("ServiceDineInOnly")}
                tooltip={t("ServiceDineInOnlyHint")}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item
                name="deliveryFee"
                label={t("DeliveryFee")}
                tooltip={t("DeliveryFeeHint")}
              >
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <FeeField
                name="tobacco"
                label={t("TobaccoPercent")}
                hint={t("TobaccoPercentHint")}
              />
            </Col>
          </Row>
          {hint(t("FeesTaxNote"))}
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={saving}
          >
            {t("Save")}
          </Button>
        </Form>
      </Card>

      <Card size="small" title={t("PosSettings")} className="mb-4">
        <Form
          form={posForm}
          layout="vertical"
          autoComplete="off"
          initialValues={settings}
          onFinish={() => save("pos")}
          disabled={!can("restaurant.manage")}
        >
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                name="defaultOrderType"
                label={t("DefaultOrderType")}
                tooltip={t("DefaultOrderTypeHint")}
              >
                <Select
                  options={["local", "dinein", "takeaway", "delivery", "app"]
                    .filter((v) => v !== "app" || channels.length)
                    .map((v) => ({ value: v, label: tPos(`type.${v}`) }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="defaultTableId"
                label={t("DefaultTable")}
                tooltip={t("DefaultTableHint")}
              >
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder={t("NoDefaultTable")}
                  notFoundContent={t("NoTablesYet")}
                  options={tables
                    .filter((tb) => tb.isActive !== false)
                    .map((tb) => {
                      const br = branches.find((b) => b.id === tb.branchId);
                      return {
                        value: tb.id,
                        label:
                          branches.length > 1 && br
                            ? `${tb.name} - ${nm(br)}`
                            : tb.name,
                      };
                    })}
                />
              </Form.Item>
            </Col>
          </Row>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={posSaving}
          >
            {t("Save")}
          </Button>
        </Form>
      </Card>

      {online && <RestaurantOnlineCard settings={online} code={orderCode} />}

      <Card size="small" title={t("AppsTitle")} className="mb-4">
        {hint(t("AppsFromPanel"))}
        {channels.length ? (
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={channels}
            scroll={{ x: 420 }}
            columns={[
              { title: t("App"), render: (_, c) => <b>{nm(c)}</b> },
              {
                title: t("Markup"),
                render: (_, c) =>
                  !Number(c.markupValue)
                    ? t("NoMarkup")
                    : c.markupType === "percent"
                      ? t("MarkupPercentText", { v: c.markupValue })
                      : t("MarkupAmountText", { v: money(c.markupValue) }),
              },
              {
                title: t("AppCommission"),
                dataIndex: "commissionPercent",
                render: (v) => (v ? <bdi>{v}%</bdi> : "—"),
              },
              {
                title: t("Status"),
                dataIndex: "isActive",
                render: (v) =>
                  v ? (
                    <Tag color="green">{t("Active")}</Tag>
                  ) : (
                    <Tag>{t("Inactive")}</Tag>
                  ),
              },
            ]}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("NoApps")}
          />
        )}
      </Card>
    </div>
  );
}

// الرسوم: النوع (نسبة / مبلغ شامل الضريبة) + القيمة جنب بعض
function FeeField({ name, label, hint }) {
  const t = useTranslations("Restaurant");
  const type = Form.useWatch(`${name}Type`) ?? "percent";
  return (
    <Form.Item label={label} tooltip={hint}>
      <Space.Compact style={{ width: "100%" }}>
        <Form.Item name={`${name}Type`} noStyle>
          <Select
            style={{ width: 150 }}
            options={["percent", "amount"].map((v) => ({
              value: v,
              label: t(`feeType.${v}`),
            }))}
          />
        </Form.Item>
        <Form.Item name={`${name}Percent`} noStyle>
          <InputNumber
            min={0}
            max={type === "percent" ? 100 : undefined}
            suffix={type === "percent" ? "%" : undefined}
            style={{ width: "100%" }}
          />
        </Form.Item>
      </Space.Compact>
    </Form.Item>
  );
}
