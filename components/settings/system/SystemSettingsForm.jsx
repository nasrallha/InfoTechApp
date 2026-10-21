"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Switch,
} from "antd";
import {
  SCALE_FORMATS,
  SCALE_VALUE_TYPES,
  parseScaleBarcode,
} from "@/lib/scale-barcode";
import { message } from "@/components/common/feedback";
import {
  AppstoreOutlined,
  PercentageOutlined,
  SaveOutlined,
  ShoppingOutlined,
  InboxOutlined,
  BarcodeOutlined,
  GlobalOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import { saveSystemSettingsAction } from "@/actions/system-settings.actions";
import { TAX_MODES } from "@/validations/system-settings.schema";

// الإعدادات العامة للنظام: الضريبة، الأصناف، المشتريات (ولاحقاً المبيعات والمخزن ...)
// canEdit: بدون صلاحية التعديل الفورم للقراءة فقط
export default function SystemSettingsForm({ settings, canEdit }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testCode, setTestCode] = useState("");
  const scaleOn = Form.useWatch("scaleEnabled", form);
  const scaleFormat = Form.useWatch("scaleFormat", form);
  const scaleValues = Form.useWatch([], form);
  // 18 رقم: فيه وزن وإجمالي مع بعض (النوع مش محتاج اختيار)
  const isLong = String(scaleFormat ?? "").split("+").length === 5;
  const testResult = testCode.trim()
    ? parseScaleBarcode(testCode, { ...scaleValues, scaleEnabled: true })
    : null;
  const t = useTranslations("SystemSettings");
  const tTax = useTranslations("TaxModes");
  const tSidebar = useTranslations("Sidebar");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");

  const onFinish = async (values) => {
    setSaving(true);
    const res = await saveSystemSettingsAction(values);
    setSaving(false);
    if (!res.success) return message.error(tAlerts(res.error));
    message.success(tAlerts("SettingsSaved"));
  };

  const section = (icon, title) => (
    <span>
      {icon} {title}
    </span>
  );

  return (
    <>
      <PageHeader title={tSidebar("SystemSettings")} />

      {!canEdit && (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title={tAlerts("ReadOnlyNoPermission")}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          taxRate: settings.taxRate,
          productPriceIncludesTax: settings.productPriceIncludesTax,
          allowNegativeStock: settings.allowNegativeStock,
          purchaseTaxMode: settings.purchaseTaxMode,
          scaleEnabled: settings.scaleEnabled,
          scaleFormat: settings.scaleFormat,
          scaleFlag: settings.scaleFlag,
          scaleValueType: settings.scaleValueType,
          scaleWeightDecimals: settings.scaleWeightDecimals,
          scaleMoneyDecimals: settings.scaleMoneyDecimals,
          defaultLocale: settings.defaultLocale ?? "en",
        }}
        disabled={!canEdit}
        style={{ maxWidth: 760 }}
      >
        {/* ============ اللغة الافتراضية ============ */}
        <Card
          size="small"
          title={section(<GlobalOutlined />, t("Language"))}
          className="mb-4"
        >
          <Form.Item
            name="defaultLocale"
            label={t("DefaultLocale")}
            extra={t("DefaultLocaleHint")}
            className="mb-0"
          >
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { value: "ar", label: "العربية" },
                { value: "en", label: "English" },
              ]}
            />
          </Form.Item>
        </Card>

        {/* ============ الضريبة ============ */}
        <Card
          size="small"
          title={section(<PercentageOutlined />, t("Tax"))}
          className="mb-4"
        >
          <Form.Item
            name="taxRate"
            label={t("TaxRate")}
            extra={t("TaxRateHint")}
            rules={[{ required: true, message: tAlerts("RequiredField") }]}
          >
            <InputNumber
              min={0}
              max={100}
              precision={2}
              suffix="%"
              style={{ width: 160 }}
            />
          </Form.Item>
        </Card>

        {/* ============ الأصناف ============ */}
        <Card
          size="small"
          title={section(<AppstoreOutlined />, t("Products"))}
          className="mb-4"
        >
          <Form.Item
            name="productPriceIncludesTax"
            label={t("ProductPriceMode")}
            extra={t("ProductPriceModeHint")}
          >
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { value: false, label: tTax("exclusive") },
                { value: true, label: tTax("inclusive") },
              ]}
            />
          </Form.Item>
        </Card>

        {/* ============ المشتريات ============ */}
        <Card
          size="small"
          title={section(<ShoppingOutlined />, t("Purchases"))}
          className="mb-4"
        >
          <Form.Item
            name="purchaseTaxMode"
            label={t("PurchaseTaxMode")}
            extra={t("PurchaseTaxModeHint")}
          >
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={TAX_MODES.map((m) => ({ value: m, label: tTax(m) }))}
            />
          </Form.Item>
        </Card>

        {/* ============ المخزون ============ */}
        <Card
          size="small"
          title={section(<InboxOutlined />, t("Stock"))}
          className="mb-4"
        >
          <Form.Item
            name="allowNegativeStock"
            label={t("AllowNegativeStock")}
            extra={t("AllowNegativeStockHint")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Card>

        {/* ============ باركود الميزان ============ */}
        <Card
          size="small"
          title={section(<BarcodeOutlined />, t("Scale"))}
          className="mb-4"
        >
          <Form.Item
            name="scaleEnabled"
            label={t("ScaleEnabled")}
            extra={t("ScaleEnabledHint")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          {scaleOn && (
            <>
              <Row gutter={[12, 0]}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="scaleFormat"
                    label={t("ScaleFormat")}
                    extra={t("ScaleFormatHint")}
                  >
                    <Select
                      options={SCALE_FORMATS.map((f) => ({
                        value: f,
                        label: `${f.split("+").length === 5 ? "EAN128:18" : "EAN13"} — ${f}`,
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item
                    name="scaleFlag"
                    label={t("ScaleFlag")}
                    tooltip={t("ScaleFlagHint")}
                    rules={[
                      {
                        pattern: new RegExp(
                          `^\\d{${String(scaleFormat ?? "1").split("+")[0]}}$`,
                        ),
                        message: tAlerts("ScaleFlagLength"),
                      },
                    ]}
                  >
                    <Input
                      maxLength={Number(
                        String(scaleFormat ?? "1").split("+")[0],
                      )}
                      style={{ width: 90 }}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                name="scaleValueType"
                label={t("ScaleValueType")}
                extra={
                  isLong ? t("ScaleValueTypeLongHint") : t("ScaleValueTypeHint")
                }
              >
                <Radio.Group
                  disabled={isLong}
                  options={SCALE_VALUE_TYPES.map((v) => ({
                    value: v,
                    label: t(`scaleValue.${v}`),
                  }))}
                />
              </Form.Item>
              <Row gutter={[12, 0]}>
                <Col xs={12} md={6}>
                  <Form.Item
                    name="scaleWeightDecimals"
                    label={t("ScaleWeightDecimals")}
                    tooltip={t("ScaleWeightDecimalsHint")}
                  >
                    <InputNumber min={0} max={4} precision={0} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item
                    name="scaleMoneyDecimals"
                    label={t("ScaleMoneyDecimals")}
                    tooltip={t("ScaleMoneyDecimalsHint")}
                  >
                    <InputNumber min={0} max={4} precision={0} />
                  </Form.Item>
                </Col>
              </Row>
              <Alert
                type="info"
                showIcon
                className="mb-3"
                title={t("ScaleItemCodeHint")}
              />
              {/* تجربة: امسح باركود من الميزان وشوف البرنامج فهمه إزاي */}
              <Form.Item label={t("ScaleTest")} extra={t("ScaleTestHint")}>
                <Input
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value)}
                  placeholder="1000123012552"
                  style={{ maxWidth: 260 }}
                  dir="ltr"
                />
              </Form.Item>
              {testCode.trim() && (
                <Alert
                  type={testResult ? "success" : "error"}
                  showIcon
                  className="mb-3"
                  title={
                    testResult
                      ? t("ScaleTestOk", {
                          code: testResult.itemCode,
                          weight:
                            testResult.weight != null ? testResult.weight : "—",
                          total:
                            testResult.total != null ? testResult.total : "—",
                        })
                      : t("ScaleTestFail")
                  }
                />
              )}
            </>
          )}
        </Card>

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
    </>
  );
}
