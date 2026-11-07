"use client";

import { useEffect, useState } from "react";
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
  CalendarOutlined,
  IdcardOutlined,
  PercentageOutlined,
  SaveOutlined,
  ShoppingOutlined,
  InboxOutlined,
  BarcodeOutlined,
  GlobalOutlined,
  NumberOutlined,
  FileTextOutlined,
  FieldTimeOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { MAX_DAY_START_HOUR, hourText } from "@/lib/business-day";
import PageHeader from "@/components/common/PageHeader";
import { useModule, useModuleSettings } from "@/components/auth/AuthProvider";
import { saveSystemSettingsAction } from "@/actions/system-settings.actions";
import { STAFF_TITLES, TAX_MODES } from "@/validations/system-settings.schema";

// الإعدادات العامة للنظام: الضريبة، الأصناف، المشتريات (ولاحقاً المبيعات والمخزن ...)
// canEdit: بدون صلاحية التعديل الفورم للقراءة فقط
export default function SystemSettingsForm({
  settings,
  canEdit,
  bookingCode = "main",
}) {
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
  const tSerial = useTranslations("Serials");
  const serialsOn = useModule("serials");
  // اسم مقدم الخدمة (وحدة الفنيين)
  // ثابت للنشاط من اللوحة ← مش بيظهر هنا
  const { staffTitleFixed = false } = useModuleSettings();
  const techOn = useModule("technicians") && !staffTitleFixed;
  const tStaff = useTranslations("StaffTitles");
  // الحجوزات (وحدة bookings)
  const bookingsOn = useModule("bookings");
  const tB = useTranslations("Bookings");
  const locale = useLocale();
  // اللينك بعد ما الصفحة تفتح (العنوان من المتصفح)
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const bookingLink = origin ? `${origin}/${locale}/book/${bookingCode}` : "";

  const router = useRouter();
  const onFinish = async (values) => {
    setSaving(true);
    const res = await saveSystemSettingsAction(values);
    setSaving(false);
    if (!res.success) return message.error(tAlerts(res.error));
    message.success(tAlerts("SettingsSaved"));
    // بداية يوم العمل وغيرها بتوصل للشاشات من بيانات الدخول ← تحديث
    router.refresh();
  };

  // بداية يوم العمل: 00:00 (منتصف الليل) لـ 12:00 الظهر
  const dayStartOptions = Array.from(
    { length: MAX_DAY_START_HOUR + 1 },
    (_, h) => ({
      value: h,
      label:
        h === 0
          ? t("DayStartMidnight")
          : t("DayStartAt", {
              time: hourText(h),
              end: `${String(h - 1).padStart(2, "0")}:59`,
            }),
    }),
  );

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
          serialRequired: settings.serialRequired ?? true,
          allowDuplicateLines: settings.allowDuplicateLines ?? false,
          staffTitle: settings.staffTitle ?? "technician",
          bookingOnline: settings.bookingOnline ?? false,
          bookingOpen: settings.bookingOpen ?? "10:00",
          bookingClose: settings.bookingClose ?? "22:00",
          bookingSlotMin: settings.bookingSlotMin ?? 30,
          bookingDaysAhead: settings.bookingDaysAhead ?? 30,
          bookingHome: settings.bookingHome ?? false,
          bookingNote: settings.bookingNote ?? "",
          purchaseTaxMode: settings.purchaseTaxMode,
          dayStartHour: settings.dayStartHour ?? 0,
          scaleEnabled: settings.scaleEnabled,
          scaleFormat: settings.scaleFormat,
          scaleFlag: settings.scaleFlag,
          scaleValueType: settings.scaleValueType,
          scaleWeightDecimals: settings.scaleWeightDecimals,
          scaleMoneyDecimals: settings.scaleMoneyDecimals,
          defaultLocale: settings.defaultLocale ?? "en",
        }}
        disabled={!canEdit}
      >
        {/* الكروت أعمدة تملا الشاشة (من غير نزول لتحت)، والشرح علامة استفهام */}
        <div className="settings-masonry">
          {/* ============ اللغة الافتراضية ============ */}
          <Card
            size="small"
            title={section(<GlobalOutlined />, t("Language"))}
            className="mb-4"
          >
            <Form.Item
              name="defaultLocale"
              label={t("DefaultLocale")}
              tooltip={t("DefaultLocaleHint")}
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
              tooltip={t("TaxRateHint")}
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
              tooltip={t("ProductPriceModeHint")}
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
              tooltip={t("PurchaseTaxModeHint")}
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
              tooltip={t("AllowNegativeStockHint")}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Card>

          {/* ============ الفواتير ============ */}
          <Card
            size="small"
            title={section(<FileTextOutlined />, t("Invoices"))}
            className="mb-4"
          >
            <Form.Item
              name="allowDuplicateLines"
              label={t("AllowDuplicateLines")}
              tooltip={t("AllowDuplicateLinesHint")}
              valuePropName="checked"
              className="mb-0"
            >
              <Switch />
            </Form.Item>
          </Card>

          {/* ============ يوم العمل (الورديات والتقارير) ============ */}
          <Card
            size="small"
            title={section(<FieldTimeOutlined />, t("BusinessDay"))}
            className="mb-4"
          >
            <Form.Item
              name="dayStartHour"
              label={t("DayStartHour")}
              tooltip={t("DayStartHourHint")}
              className="mb-0"
            >
              <Select style={{ maxWidth: 320 }} options={dayStartOptions} />
            </Form.Item>
          </Card>

          {/* ============ مقدم الخدمة (وحدة technicians) ============ */}
          {techOn && (
            <Card
              size="small"
              title={section(<IdcardOutlined />, tStaff("SectionTitle"))}
              className="mb-4"
            >
              <Form.Item
                name="staffTitle"
                label={tStaff("Label")}
                tooltip={tStaff("Hint")}
                className="mb-0"
              >
                <Select
                  style={{ maxWidth: 320 }}
                  options={STAFF_TITLES.map((v) => ({
                    value: v,
                    label: `${tStaff(`${v}.one`)} / ${tStaff(`${v}.many`)}`,
                  }))}
                />
              </Form.Item>
            </Card>
          )}

          {/* ============ الحجوزات (وحدة bookings) ============ */}
          {bookingsOn && (
            <Card
              size="small"
              title={section(<CalendarOutlined />, tB("SettingsTitle"))}
              className="mb-4"
            >
              <Row gutter={12}>
                <Col xs={12} md={6}>
                  <Form.Item
                    name="bookingOpen"
                    label={tB("OpenAt")}
                    rules={[
                      {
                        pattern: /^([01]\d|2[0-3]):[0-5]\d$/,
                        message: "HH:mm",
                      },
                    ]}
                  >
                    <Input dir="ltr" placeholder="10:00" maxLength={5} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item
                    name="bookingClose"
                    label={tB("CloseAt")}
                    rules={[
                      {
                        pattern: /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/,
                        message: "HH:mm",
                      },
                    ]}
                  >
                    <Input dir="ltr" placeholder="22:00" maxLength={5} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item
                    name="bookingSlotMin"
                    label={tB("SlotMin")}
                    tooltip={tB("SlotMinHint")}
                  >
                    <InputNumber
                      min={5}
                      max={240}
                      step={5}
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="bookingDaysAhead" label={tB("DaysAhead")}>
                    <InputNumber min={1} max={365} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                name="bookingOnline"
                label={tB("OnlineEnabled")}
                tooltip={tB("OnlineEnabledHint")}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Form.Item noStyle shouldUpdate>
                {({ getFieldValue }) =>
                  getFieldValue("bookingOnline") && bookingLink ? (
                    <Alert
                      className="mb-3"
                      type="success"
                      showIcon
                      title={tB("PublicLink")}
                      description={
                        <Input.Search
                          readOnly
                          dir="ltr"
                          value={bookingLink}
                          enterButton={tB("Copy")}
                          onSearch={() => {
                            navigator.clipboard
                              ?.writeText(bookingLink)
                              .then(() => message.success(tB("Copied")))
                              .catch(() => {});
                          }}
                        />
                      }
                    />
                  ) : null
                }
              </Form.Item>
              <Form.Item
                name="bookingHome"
                label={tB("HomeEnabled")}
                tooltip={tB("HomeEnabledHint")}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Form.Item
                name="bookingNote"
                label={tB("PublicNote")}
                tooltip={tB("PublicNoteHint")}
                className="mb-0"
              >
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
            </Card>
          )}

          {/* ============ الأرقام التسلسلية (وحدة serials) ============ */}
          {serialsOn && (
            <Card
              size="small"
              title={section(<NumberOutlined />, tSerial("SectionTitle"))}
              className="mb-4"
            >
              <Form.Item
                name="serialRequired"
                label={tSerial("RequiredAtSale")}
                tooltip={tSerial("RequiredAtSaleHint")}
                valuePropName="checked"
                className="mb-0"
              >
                <Switch />
              </Form.Item>
            </Card>
          )}

          {/* ============ باركود الميزان ============ */}
          <Card
            size="small"
            title={section(<BarcodeOutlined />, t("Scale"))}
            className="mb-4"
          >
            <Form.Item
              name="scaleEnabled"
              label={t("ScaleEnabled")}
              tooltip={t("ScaleEnabledHint")}
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
                      tooltip={t("ScaleFormatHint")}
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
                    isLong
                      ? t("ScaleValueTypeLongHint")
                      : t("ScaleValueTypeHint")
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
                <Form.Item label={t("ScaleTest")} tooltip={t("ScaleTestHint")}>
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
                              testResult.weight != null
                                ? testResult.weight
                                : "—",
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
        </div>

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
