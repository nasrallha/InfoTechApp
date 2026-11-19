"use client";

import { useCallback, useEffect, useState } from "react";
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
  Segmented,
  Space,
  Switch,
  Upload,
} from "antd";
import { message } from "@/components/common/feedback";
import {
  BgColorsOutlined,
  DeleteOutlined,
  LayoutOutlined,
  UploadOutlined,
  ColumnWidthOutlined,
  FileOutlined,
  FileTextOutlined,
  PrinterOutlined,
  SaveOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { saveInvoicePrintAction, saveLetterImageAction } from "@/actions/invoice-print.actions";
import { applyFieldErrors } from "@/lib/form-errors";
import {
  PAPER_SIZES,
  FONT_SIZES,
  INVOICE_LANGUAGES,
  LOGO_SIZES,
  A4_TEMPLATES,
} from "@/validations/invoice-print.schema";
import { IMAGE_TYPES, imageUrl } from "@/lib/image";
import InvoiceA4 from "./InvoiceA4";
import InvoiceView, { PRINT_AREA } from "./InvoiceView";
import PrintInvoice from "./PrintInvoice";
import ScaledBox from "../ScaledBox";
import AndroidPrintCard from "../AndroidPrintCard";
import { readDevicePaper, saveDevicePaper } from "@/lib/device-paper";
import { sampleA4Doc, sampleInvoice } from "./sampleInvoice";
import "../printing.css";
import { actionErrorText } from "@/components/common/actionError";

const PX_PER_MM = 96 / 25.4;

// اختيار نوع الطباعة بكروت واضحة (بدل أزرار صغيرة)
// value / onChange: يرسلها Form.Item تلقائياً
function PaperPicker({ value, onChange, disabled, t }) {
  return (
    <div className="paper-picker">
      {PAPER_SIZES.map((size) => (
        <button
          key={size}
          type="button"
          disabled={disabled}
          onClick={() => onChange?.(size)}
          className={`paper-picker__item ${value === size ? "paper-picker__item--active" : ""}`}
        >
          {/* شكل الورقة: A4 عريضة، والكاشير شريط طويل */}
          <span
            className={`paper-picker__icon paper-picker__icon--${size === "A4" ? "a4" : size === "80mm" ? "r80" : "r58"}`}
          >
            {size === "A4" ? <FileOutlined /> : <PrinterOutlined />}
          </span>
          <span className="paper-picker__title">{t(`papers.${size}`)}</span>
          <span className="paper-picker__hint">{t(`paperHints.${size}`)}</span>
        </button>
      ))}
    </div>
  );
}

// إعدادات طباعة الفواتير: الإعدادات على جنب ومعاينة حية للفاتورة على الجنب الآخر
// settings: المحفوظة (أو الافتراضية)، company: بيانات الشركة، branch: الفرع الحالي
// cashierName: اسم المستخدم الحالي (للمعاينة)، canEdit: يملك صلاحية التعديل؟
export default function InvoicePrintSettingsForm({
  settings,
  company,
  branch,
  cashierName,
  canEdit,
}) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  // صورة الورقة الجاهزة (بترفع على طول) + المعاينة: كاشير أو A4
  const [letterImage, setLetterImage] = useState(settings.letterImage ?? null);
  const [uploading, setUploading] = useState(false);
  const [previewMode, setPreviewMode] = useState(null);
  // نوع الطباعة على الجهاز ده (كوكي) - "" = الافتراضي (إعداد الشركة)
  const [devicePaper, setDevicePaper] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDevicePaper(readDevicePaper());
  }, []);
  // اختيار نوع الطباعة = للجهاز ده بس (بيتحفظ على طول من غير زرار الحفظ)
  // "" = يرجع للنوع الافتراضي
  const pickDevicePaper = (v) => {
    if (!saveDevicePaper(v)) return message.error(t("AndroidPrintStorageBlocked"));
    setDevicePaper(v);
    setPreviewMode(null);
    message.success(t(v ? "DevicePaperSaved" : "DevicePaperReset"));
  };
  const locale = useLocale();
  const t = useTranslations("InvoicePrint");
  const tSidebar = useTranslations("Sidebar");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");

  // كل تغيير في الفورم يظهر في المعاينة فوراً
  const values = Form.useWatch([], form);
  const companyPaper = values?.paperSize ?? settings.paperSize;
  // المعاينة بنوع الطباعة على الجهاز ده
  const preview = { ...settings, ...(values ?? {}), paperSize: devicePaper || companyPaper };

  const onFinish = async (formValues) => {
    setSaving(true);
    const res = await saveInvoicePrintAction(formValues);
    setSaving(false);

    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(actionErrorText(res, tAlerts));
      return;
    }
    message.success(tAlerts("InvoicePrintSaved"));
  };

  const onPrintDone = useCallback(() => setPrinting(false), []);

  // الفاتورة التجريبية ثابتة (حتى لا يتغير وقتها و QR مع كل تعديل)
  const [invoice] = useState(() => sampleInvoice({ cashier: cashierName }));

  // المعاينة: A4 (النموذج) أو الكاشير - افتراضياً حسب نوع الطباعة
  const showA4 = (previewMode ?? (preview.paperSize === "A4" ? "A4" : "thermal")) === "A4";
  const a4Company = company
    ? {
        ...company,
        a4: {
          template: preview.a4Template ?? "classic",
          top: preview.letterTop ?? 45,
          bottom: preview.letterBottom ?? 0,
          image: letterImage,
        },
      }
    : null;
  const uploadLetter = async (file) => {
    setUploading(true);
    const fd = new FormData();
    if (file) fd.append("image", file);
    const res = await saveLetterImageAction(fd);
    setUploading(false);
    if (!res.success) return message.error(actionErrorText(res, tAlerts));
    setLetterImage(res.data.letterImage);
  };

  // تصغير المعاينة لتناسب المساحة (A4 أعرض بكثير من الكاشير)
  const paperPx = (showA4 ? PRINT_AREA.A4 : (PRINT_AREA[preview.paperSize] ?? 72)) * PX_PER_MM;
  const scale = Math.min(1.25, 440 / paperPx);

  const lastUpdate = settings.updatedAt
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(settings.updatedAt))
    : null;

  const radios = (name, list, prefix) => (
    <Form.Item name={name} label={t(name)}>
      <Radio.Group
        optionType="button"
        buttonStyle="solid"
        options={list.map((v) => ({ value: v, label: t(`${prefix}.${v}`) }))}
      />
    </Form.Item>
  );

  const toggle = (name) => (
    <Col xs={12} sm={8}>
      <Form.Item name={name} label={t(name)} valuePropName="checked">
        <Switch />
      </Form.Item>
    </Col>
  );

  const marginField = (name) => (
    <Col xs={12} sm={6}>
      <Form.Item
        name={name}
        label={t(name)}
        rules={[{ required: true, message: tAlerts("RequiredField") }]}
      >
        <InputNumber
          min={0}
          max={30}
          precision={0}
          suffix="mm"
          style={{ width: "100%" }}
        />
      </Form.Item>
    </Col>
  );

  return (
    <div>
      {/* رأس الصفحة */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="font-bold text-xl m-0">
            {tSidebar("InvoicePrinting")}
          </h1>
          <p className="text-slate-500 m-0 mt-1 text-sm">
            {lastUpdate ? `${t("LastUpdate")}: ${lastUpdate}` : t("PageHint")}
          </p>
        </div>
        <Space wrap>
          <Button
            size="large"
            icon={<PrinterOutlined />}
            onClick={() => setPrinting(true)}
          >
            {t("TestPrint")}
          </Button>
          {canEdit && (
            <Button
              type="primary"
              size="large"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={() => form.submit()}
            >
              {tButtons("Save")}
            </Button>
          )}
        </Space>
      </div>

      {!canEdit && (
        <Alert
          type="warning"
          showIcon
          title={tAlerts("ReadOnlyNoPermission")}
          className="mb-4"
        />
      )}
      {!company && (
        <Alert type="info" showIcon title={t("NoCompany")} className="mb-4" />
      )}

      <Row gutter={[20, 16]}>
        {/* ============ الإعدادات ============ */}
        <Col xs={24} xl={13}>
          <Form
            form={form}
            layout="vertical"
            autoComplete="off"
            onFinish={onFinish}
            disabled={!canEdit}
            initialValues={settings}
            requiredMark={false}
          >
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
              {/* الورق والهوامش */}
              <Card
                size="small"
                title={
                  <span>
                    <ColumnWidthOutlined /> {t("PaperAndMargins")}
                  </span>
                }
              >
                {/* نوع الطباعة على الجهاز ده: A4 أو كاشير 80mm أو كاشير 58mm
                    (بيتحفظ على الجهاز على طول، شغال حتى من غير صلاحية التعديل) */}
                <Form.Item label={t("DevicePaper")} tooltip={t("DevicePaperHint")}>
                  <PaperPicker
                    t={t}
                    value={devicePaper || companyPaper}
                    onChange={pickDevicePaper}
                    disabled={false}
                  />
                </Form.Item>
                <Alert
                  className="mb-3"
                  type={devicePaper ? "success" : "info"}
                  showIcon
                  title={
                    devicePaper
                      ? t("DevicePaperOn", { paper: t(`papers.${devicePaper}`) })
                      : t("DevicePaperOff")
                  }
                  action={
                    devicePaper ? (
                      <Button size="small" disabled={false} onClick={() => pickDevicePaper("")}>
                        {t("DevicePaperUseDefault")}
                      </Button>
                    ) : null
                  }
                />
                {/* النوع الافتراضي (الشركة): للأجهزة اللي مااتحددلهاش نوع - بيتحفظ بزرار الحفظ */}
                <Form.Item
                  name="paperSize"
                  label={t("CompanyPaperSize")}
                  tooltip={t("CompanyPaperSizeHint")}
                >
                  <Segmented
                    options={["80mm", "58mm", "A4"].map((p) => ({
                      value: p,
                      label: t(`papers.${p}`),
                    }))}
                  />
                </Form.Item>
                <Row gutter={[12, 0]}>
                  {marginField("marginTop")}
                  {marginField("marginBottom")}
                  {marginField("marginRight")}
                  {marginField("marginLeft")}
                </Row>
                <p className="text-xs text-slate-400 m-0">{t("MarginsHint")}</p>
              </Card>

              {/* طباعة أندرويد (RawBT): إعداد الجهاز ده بس */}
              <AndroidPrintCard paper={preview.paperSize} />


              {/* نموذج A4: الحالي / ثنائي اللغة / ورق مطبوع جاهز (كل المستندات A4) */}
              <Card
                size="small"
                title={
                  <span>
                    <LayoutOutlined /> {t("A4Template")}
                  </span>
                }
              >
                <Form.Item name="a4Template" extra={t("A4TemplateHint")}>
                  <Radio.Group
                    optionType="button"
                    buttonStyle="solid"
                    options={A4_TEMPLATES.map((v) => ({ value: v, label: t(`tpl_${v}`) }))}
                  />
                </Form.Item>
                {preview.a4Template === "letterhead" && (
                  <Row gutter={[12, 0]}>
                    <Col xs={12} sm={8}>
                      <Form.Item name="letterTop" label={t("letterTop")} tooltip={t("letterTopHint")}>
                        <InputNumber min={0} max={150} precision={0} suffix="mm" style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8}>
                      <Form.Item name="letterBottom" label={t("letterBottom")} tooltip={t("letterBottomHint")}>
                        <InputNumber min={0} max={150} precision={0} suffix="mm" style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item label={t("letterImage")} tooltip={t("letterImageHint")}>
                        <Space wrap>
                          <Upload
                            accept={IMAGE_TYPES.join(",")}
                            showUploadList={false}
                            disabled={!canEdit || uploading}
                            beforeUpload={(file) => {
                              uploadLetter(file);
                              return false;
                            }}
                          >
                            <Button icon={<UploadOutlined />} loading={uploading}>
                              {t("UploadLetter")}
                            </Button>
                          </Upload>
                          {letterImage && (
                            <>
                              <img
                                src={imageUrl(letterImage)}
                                alt=""
                                style={{ height: 40, border: "1px solid var(--c-border)" }}
                              />
                              <Button
                                danger
                                icon={<DeleteOutlined />}
                                disabled={!canEdit || uploading}
                                onClick={() => uploadLetter(null)}
                              />
                            </>
                          )}
                        </Space>
                      </Form.Item>
                    </Col>
                  </Row>
                )}
              </Card>

              {/* الشكل */}
              <Card
                size="small"
                title={
                  <span>
                    <BgColorsOutlined /> {t("Appearance")}
                  </span>
                }
              >
                <Row gutter={[12, 0]}>
                  <Col xs={24} md={12}>
                    {radios("language", INVOICE_LANGUAGES, "languages")}
                  </Col>
                  <Col xs={24} md={12}>
                    {radios("fontSize", FONT_SIZES, "sizes")}
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item
                      name="showLogo"
                      label={t("showLogo")}
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={18}>
                    <Form.Item name="logoSize" label={t("logoSize")}>
                      <Radio.Group
                        optionType="button"
                        buttonStyle="solid"
                        disabled={!preview.showLogo}
                        options={LOGO_SIZES.map((v) => ({
                          value: v,
                          label: t(`logoSizes.${v}`),
                        }))}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              {/* الرأس + الأعمدة */}
              <Card
                size="small"
                title={
                  <span>
                    <UserOutlined /> {t("HeaderAndColumns")}
                  </span>
                }
              >
                <p className="text-xs text-slate-400 mt-0">{t("HeaderHint")}</p>
                <Row gutter={[12, 0]}>
                  {toggle("showCashier")}
                  {toggle("showCustomer")}
                  {toggle("showPhone")}
                  {toggle("showEmail")}
                </Row>
                <div className="font-bold text-slate-600 mb-2">
                  <UnorderedListOutlined /> {t("ItemColumns")}
                </div>
                <Row gutter={[12, 0]}>
                  {toggle("showItemCode")}
                  {toggle("showUnit")}
                  {toggle("showDiscount")}
                  {toggle("showItemTax")}
                </Row>
              </Card>

              {/* الذيل */}
              <Card
                size="small"
                title={
                  <span>
                    <FileTextOutlined /> {t("Footer")}
                  </span>
                }
              >
                <Row gutter={[12, 0]}>
                  <Col xs={24}>
                    <Form.Item
                      name="showSignatures"
                      label={t("showSignatures")}
                      tooltip={t("SignaturesHint")}
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                  <Col xs={24}>
                    <Form.Item
                      name="showBankAccount"
                      label={t("showBankAccount")}
                      tooltip={t("BankHint")}
                      valuePropName="checked"
                      extra={
                        preview.showBankAccount &&
                        !company?.iban &&
                        !company?.bankAccountNumber
                          ? t("NoBankData")
                          : null
                      }
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                </Row>
                <p className="text-xs text-slate-400 mt-0">{t("FooterHint")}</p>
                <Row gutter={[12, 0]}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="footerTextAr"
                      label={t("footerTextAr")}
                      rules={[{ max: 500, message: tAlerts("TextTooLong") }]}
                    >
                      <Input.TextArea
                        rows={3}
                        placeholder={t("FooterPlaceholderAr")}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="footerTextEn"
                      label={t("footerTextEn")}
                      rules={[{ max: 500, message: tAlerts("TextTooLong") }]}
                    >
                      <Input.TextArea
                        rows={3}
                        dir="ltr"
                        placeholder="Thank you for your visit"
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              {/* التشغيل */}
              <Card
                size="small"
                title={
                  <span>
                    <SettingOutlined /> {t("Behavior")}
                  </span>
                }
              >
                <Row gutter={[12, 0]}>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      name="autoPrint"
                      label={t("autoPrint")}
                      tooltip={t("AutoPrintHint")}
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      name="copies"
                      label={t("copies")}
                      rules={[
                        { required: true, message: tAlerts("RequiredField") },
                      ]}
                    >
                      <InputNumber
                        min={1}
                        max={5}
                        precision={0}
                        style={{ width: 120 }}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Alert type="info" showIcon title={t("SilentPrintHint")} />
              </Card>
            </Space>
          </Form>
        </Col>

        {/* ============ المعاينة الحية ============ */}
        <Col xs={24} xl={11}>
          <div className="invoice-preview">
            <div className="font-bold text-slate-600 mb-3">
              {t("LivePreview")}
              <Segmented
                size="small"
                className="ms-2"
                value={showA4 ? "A4" : "thermal"}
                onChange={setPreviewMode}
                options={[
                  { value: "thermal", label: t("PreviewThermal") },
                  { value: "A4", label: t("PreviewA4") },
                ]}
              />
            </div>
            <ScaledBox
              className="invoice-preview__paper"
              width={paperPx}
              scale={scale}
            >
              {showA4 ? (
                <InvoiceA4
                  kind="sale"
                  doc={sampleA4Doc(invoice, branch)}
                  company={a4Company}
                  settings={preview}
                />
              ) : (
                <InvoiceView
                  settings={preview}
                  company={company}
                  branch={branch}
                  invoice={invoice}
                />
              )}
            </ScaledBox>
          </div>
        </Col>
      </Row>

      {/* طباعة تجريبية بالإعدادات الحالية (حتى قبل الحفظ) */}
      {printing && (
        <PrintInvoice
          settings={preview}
          company={company}
          branch={branch}
          invoice={invoice}
          onDone={onPrintDone}
        />
      )}
    </div>
  );
}
