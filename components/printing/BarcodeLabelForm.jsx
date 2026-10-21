"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Switch,
  Tag,
} from "antd";
import { message } from "@/components/common/feedback";
import { useLocale, useTranslations } from "next-intl";
import {
  createBarcodeLabelAction,
  updateBarcodeLabelAction,
} from "@/actions/barcode-label.actions";
import { BARCODE_FORMATS, BARCODE_SIZES } from "@/validations/barcode-label.schema";
import { applyFieldErrors } from "@/lib/form-errors";
import LabelPreview from "./LabelPreview";
import { sampleItem } from "./sample";
import { useCurrency } from "@/components/common/CurrencyProvider";

// القيم الافتراضية لقالب جديد
const NEW_LABEL = {
  width: 50,
  height: 25,
  barcodeFormat: "CODE128",
  barcodeSize: "normal",
  showName: true,
  showPrice: true,
  priceWithTax: true,
  showCode: true,
  showCompany: false,
  nameFontSize: 7,
  priceFontSize: 9,
  isDefault: false,
  isActive: true,
};

// فورم قالب الملصق (إضافة وتعديل) مع معاينة حية بجانبه
// label: القالب في التعديل (أو null في الإضافة)
// onSuccess, setLoading: يرسلها FormModal تلقائياً
export default function BarcodeLabelForm({
  formId,
  label = null,
  companyName,
  onSuccess,
  setLoading,
}) {
  const [form] = Form.useForm();
  const isEdit = Boolean(label);
  const locale = useLocale();
  const t = useTranslations("Printing");
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");
  const [eanInvalid, setEanInvalid] = useState(false);
  const { symbol: currency } = useCurrency(); // رمز العملة الأساسية

  useEffect(() => {
    form.setFieldsValue(label ?? NEW_LABEL);
  }, [label, form]);

  // كل تغيير في الفورم يظهر في المعاينة فوراً
  const values = Form.useWatch([], form);
  const preview = { ...NEW_LABEL, ...(label ?? {}), ...(values ?? {}) };
  const sizeOk = preview.width >= 15 && preview.height >= 10;

  useEffect(() => setEanInvalid(false), [preview.barcodeFormat]);

  const onFinish = async (formValues) => {
    setLoading?.(true);
    const res = isEdit
      ? await updateBarcodeLabelAction({ ...formValues, id: label.id })
      : await createBarcodeLabelAction(formValues);
    setLoading?.(false);

    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts(isEdit ? "LabelUpdated" : "LabelAdded"));
    if (!isEdit) form.resetFields();
    onSuccess?.();
  };

  const nameRules = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
    { min: 3, message: tAlerts("MinCharcters") },
    { max: 100, message: tAlerts("TextTooLong") },
  ];
  const required = [{ required: true, message: tAlerts("RequiredField") }];

  return (
    <Row gutter={[24, 16]} style={{ padding: "12px 12px 0" }}>
      {/* الفورم */}
      <Col xs={24} md={14}>
        <Form
          form={form}
          id={formId}
          layout="vertical"
          autoComplete="off"
          onFinish={onFinish}
          initialValues={label ?? NEW_LABEL}
          requiredMark={false}
        >
          <Row gutter={[12, 0]}>
            <Col xs={24} sm={12}>
              <Form.Item name="arName" label={tForm("ArName")} rules={nameRules}>
                <Input placeholder={t("NamePlaceholderAr")} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="enName" label={tForm("EnName")} rules={nameRules}>
                <Input dir="ltr" placeholder={t("NamePlaceholderEn")} />
              </Form.Item>
            </Col>

            {/* المقاس */}
            <Col xs={12}>
              <Form.Item name="width" label={t("Width")} rules={required}>
                <InputNumber
                  min={15}
                  max={200}
                  precision={0}
                  suffix="mm"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="height" label={t("Height")} rules={required}>
                <InputNumber
                  min={10}
                  max={200}
                  precision={0}
                  suffix="mm"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider titlePlacement="start">{t("Barcode")}</Divider>
          <Row gutter={[12, 0]}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="barcodeFormat"
                label={t("BarcodeFormat")}
                tooltip={t("BarcodeFormatHint")}
              >
                <Radio.Group
                  optionType="button"
                  buttonStyle="solid"
                  options={BARCODE_FORMATS.map((f) => ({ value: f, label: t(`formats.${f}`) }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="barcodeSize" label={t("BarcodeSize")} tooltip={t("BarcodeSizeHint")}>
                <Radio.Group
                  optionType="button"
                  buttonStyle="solid"
                  options={BARCODE_SIZES.map((s) => ({ value: s, label: t(`sizes.${s}`) }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider titlePlacement="start">{t("Content")}</Divider>
          <Row gutter={[12, 0]}>
            <Col xs={12} sm={8}>
              <Form.Item name="showName" label={t("ShowName")} valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="showCode" label={t("ShowCode")} valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="showCompany" label={t("ShowCompany")} valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="showPrice" label={t("ShowPrice")} valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item name="priceWithTax" label={t("PriceType")}>
                <Radio.Group
                  disabled={!preview.showPrice}
                  options={[
                    { value: true, label: t("PriceWithTax") },
                    { value: false, label: t("PriceWithoutTax") },
                  ]}
                />
              </Form.Item>
            </Col>

            <Col xs={12}>
              <Form.Item name="nameFontSize" label={t("NameFontSize")} rules={required}>
                <InputNumber min={4} max={40} precision={0} suffix="pt" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="priceFontSize" label={t("PriceFontSize")} rules={required}>
                <InputNumber min={4} max={48} precision={0} suffix="pt" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider />
          <Row gutter={[12, 0]}>
            <Col xs={12}>
              <Form.Item name="isActive" label={tForm("Active")} valuePropName="checked">
                <Switch disabled={label?.isDefault} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item
                name="isDefault"
                label={t("IsDefault")}
                tooltip={t("IsDefaultHint")}
                valuePropName="checked"
              >
                {/* الافتراضي الحالي لا يُلغى من هنا: يتغير باختيار قالب آخر */}
                <Switch disabled={label?.isDefault} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Col>

      {/* المعاينة الحية */}
      <Col xs={24} md={10}>
        <div className="label-form__stage">
          <span className="font-bold text-slate-600">{t("LivePreview")}</span>
          {sizeOk ? (
            <LabelPreview
              label={preview}
              item={sampleItem(locale)}
              companyName={companyName}
              currency={currency}
              maxWidth={300}
              maxHeight={360}
              onInvalidFormat={() => setEanInvalid(true)}
            />
          ) : (
            <span className="text-slate-400">—</span>
          )}
          <Tag color="geekblue" style={{ direction: "ltr" }}>
            {preview.width} × {preview.height} mm
          </Tag>
          {eanInvalid && <Alert type="warning" showIcon title={t("EanFallback")} />}
          {preview.showCompany && !companyName && (
            <Alert type="info" showIcon title={t("NoCompanyName")} />
          )}
        </div>
      </Col>
    </Row>
  );
}
