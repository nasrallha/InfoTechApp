"use client";

import { useEffect } from "react";
import {
  Alert,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Row,
  Col,
  Divider,
} from "antd";
import { message } from "@/components/common/feedback";
import { useLocale, useTranslations } from "next-intl";
import { BUYER_ID_SCHEMES, COUNTRIES } from "@/lib/zatca-tax";
import { applyFieldErrors } from "@/lib/form-errors";

// فورم العميل أو المورد (نفس الفورم للإضافة والتعديل)
// party: البيانات الحالية في التعديل (أو null في الإضافة)
// config: إعدادات النوع (الـ actions ومفاتيح الرسائل) من partyConfig
// nextCode: الكود التالي (يظهر في الإضافة فقط، والسيرفر هو الذي يعطيه فعلياً)
// onSuccess, setLoading: يرسلها FormModal تلقائياً
// مثال لشكل رقم المعرّف حسب نوعه (يظهر جوه الخانة)
const ID_EXAMPLES = {
  CRN: "2250043577",
  700: "7001234567",
  NAT: "1012345678",
  IQA: "2345678901",
  TIN: "3000000000",
  PAS: "A12345678",
};

const PartyForm = ({
  formId,
  party = null,
  config,
  nextCode,
  onSuccess,
  setLoading,
}) => {
  const [form] = Form.useForm();
  const isEdit = Boolean(party);

  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();

  // تعبئة الفورم في وضع التعديل
  useEffect(() => {
    if (party) form.setFieldsValue(party);
  }, [party, form]);

  const onFinish = async (values) => {
    // لا توجد ملفات، فنرسل كائناً عادياً
    // الكود لا نرسله: السيرفر يولّده في الإضافة ولا يغيّره في التعديل
    const payload = {
      ...values,
      openingBalance: values.openingBalance ?? 0,
      ...(isEdit ? { id: party.id } : {}),
    };
    delete payload.code;

    setLoading?.(true);
    const res = isEdit
      ? await config.updateAction(payload)
      : await config.createAction(payload);
    setLoading?.(false);

    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts(isEdit ? config.updated : config.added));
    if (!isEdit) form.resetFields();
    // بنرجّع العميل/المورد الجديد (للإضافة السريعة من شاشات البيع والشراء)
    onSuccess?.(res.data);
  };

  const required = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
  ];

  // العملاء بس: الدولة + معرّف العميل (الربط مع الزكاة / التصدير)
  // - عميل برّه المملكة: من غير رقم ضريبي سعودي والعنوان بشكل حر
  // - عميل محلي له رقم ضريبي أو معرّف = شركة (فاتورته ضريبية): العنوان الوطني كله إجباري
  const taxNoValue = Form.useWatch("taxNo", form);
  const countryCode = Form.useWatch("countryCode", form) ?? "SA";
  const idScheme = Form.useWatch("idScheme", form);
  const idNumber = Form.useWatch("idNumber", form);
  const foreign = Boolean(config.b2b && countryCode !== "SA");
  const has = (v) => Boolean(v && String(v).trim());
  const b2b = Boolean(
    config.b2b && !foreign && (has(taxNoValue) || (idScheme && has(idNumber))),
  );
  // العميل الأجنبي: الشارع والمدينة إجباريين (بيانات فاتورة التصدير)
  const foreignRequired = foreign
    ? [{ required: true, whitespace: true, message: tAlerts("RequiredField") }]
    : [];
  // أرقام العنوان الوطني (للعميل المحلي بس)
  const saDigits = (pattern, errorKey) =>
    foreign ? [] : [{ pattern, message: tAlerts(errorKey) }];
  const b2bRequired = b2b
    ? [
        {
          required: true,
          whitespace: true,
          message: tAlerts("B2BFieldRequired"),
        },
      ]
    : [];
  const nameRules = [
    ...required,
    { min: 3, message: tAlerts("MinCharcters") },
    { max: 255, message: tAlerts("TextTooLong") },
  ];
  const maxText = (max) => [{ max, message: tAlerts("TextTooLong") }];
  // قاعدة "أرقام فقط بطول معيّن" للحقول الاختيارية
  const digits = (pattern, errorKey) => [
    { pattern, message: tAlerts(errorKey) },
  ];

  return (
    <Form
      form={form}
      id={formId}
      layout="vertical"
      autoComplete="off"
      onFinish={onFinish}
      initialValues={{
        code: nextCode,
        openingBalance: 0,
        isActive: true,
        countryCode: "SA",
      }}
      style={{ padding: "10px 10px 0 10px" }}
    >
      {/* البيانات الأساسية */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={4}>
          {/* الكود تلقائي: للعرض فقط ولا يمكن تعديله */}
          <Form.Item
            name="code"
            label={tForm("Code")}
            tooltip={tForm("CodeAutoHint")}
          >
            <InputNumber disabled style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={10}>
          <Form.Item
            name="arName"
            label={tForm("ArName")}
            rules={nameRules}
            hasFeedback
          >
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={10}>
          <Form.Item
            name="enName"
            label={tForm("EnName")}
            rules={nameRules}
            hasFeedback
          >
            <Input />
          </Form.Item>
        </Col>

        <Col xs={24} md={8}>
          <Form.Item
            name="phone"
            label={tForm("Phone")}
            rules={digits(/^\d{9,11}$/, "PhoneInvalid")}
          >
            <Input inputMode="numeric" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name="taxNo"
            label={tForm("TaxNo")}
            rules={
              config.b2b
                ? digits(/^3\d{13}3$/, "TaxNoInvalidZatca")
                : digits(/^\d{15}$/, "TaxNoInvalid")
            }
            extra={foreign ? tForm("TaxNoForeignHint") : null}
          >
            <Input inputMode="numeric" maxLength={15} disabled={foreign} />
          </Form.Item>
        </Col>
        {/* السجل التجاري: للموردين بس (العميل سجله بيتكتب في المعرّف) */}
        {!config.b2b && (
          <Col xs={24} md={8}>
            <Form.Item
              name="registrationNo"
              label={tForm("RegistrationNo")}
              rules={digits(/^\d{10}$/, "RegistrationNoInvalid")}
            >
              <Input inputMode="numeric" maxLength={10} />
            </Form.Item>
          </Col>
        )}
      </Row>

      {/* الدولة ومعرّف العميل (العملاء بس) */}
      {config.b2b && (
        <Row gutter={[16, 0]}>
          <Col xs={24} md={8}>
            <Form.Item
              name="countryCode"
              label={tForm("Country")}
              tooltip={tForm("CountryHint")}
            >
              <Select
                showSearch
                optionFilterProp="label"
                onChange={(v) => v !== "SA" && form.setFieldValue("taxNo", "")}
                options={COUNTRIES.map(([code, ar, en]) => ({
                  value: code,
                  label: `${locale === "ar" ? ar : en} (${code})`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="idScheme"
              label={tForm("IdScheme")}
              tooltip={tForm("IdSchemeHint")}
            >
              <Select
                allowClear
                options={BUYER_ID_SCHEMES.map((code) => ({
                  value: code,
                  label: `${tForm(`idSchemes.${code}`)} (${code})`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="idNumber"
              label={
                idScheme
                  ? tForm("IdNumberOf", {
                      type: tForm(`idSchemes.${idScheme}`),
                    })
                  : tForm("IdNumber")
              }
              rules={
                idScheme
                  ? [
                      {
                        required: true,
                        whitespace: true,
                        message: tAlerts("RequiredField"),
                      },
                      ...maxText(30),
                    ]
                  : maxText(30)
              }
            >
              <Input
                maxLength={30}
                disabled={!idScheme}
                dir="ltr"
                placeholder={ID_EXAMPLES[idScheme] ?? ""}
              />
            </Form.Item>
          </Col>
        </Row>
      )}

      {/* العنوان الوطني (أو عنوان العميل برّه المملكة) */}
      <Divider titlePlacement="start">
        {foreign ? tForm("ForeignAddress") : tForm("NationalAddress")}
      </Divider>
      {b2b && (
        <Alert
          type="info"
          showIcon
          className="mb-3"
          title={tForm("B2BAddressHint")}
        />
      )}
      <Row gutter={[16, 0]}>
        {/* العنوان الوطني كله اختياري */}
        <Col xs={24} md={8}>
          <Form.Item
            name="city"
            label={tForm("City")}
            rules={[...b2bRequired, ...foreignRequired, ...maxText(100)]}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name="district"
            label={tForm("District")}
            rules={[...b2bRequired, ...maxText(100)]}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name="street"
            label={tForm("Street")}
            rules={[...b2bRequired, ...foreignRequired, ...maxText(100)]}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col xs={8}>
          <Form.Item
            name="buildingNo"
            label={tForm("BuildingNo")}
            rules={[
              ...b2bRequired,
              ...saDigits(/^\d{4}$/, "BuildingNoInvalid"),
            ]}
          >
            <Input maxLength={foreign ? 10 : 4} />
          </Form.Item>
        </Col>
        <Col xs={8}>
          <Form.Item
            name="additionalNo"
            label={tForm("AdditionalNo")}
            rules={saDigits(/^\d{4}$/, "AdditionalNoInvalid")}
          >
            <Input maxLength={foreign ? 10 : 4} />
          </Form.Item>
        </Col>
        <Col xs={8}>
          <Form.Item
            name="postalCode"
            label={tForm("PostalCode")}
            rules={[
              ...b2bRequired,
              ...saDigits(/^\d{5}$/, "PostalCodeInvalid"),
            ]}
          >
            <Input maxLength={foreign ? 10 : 5} />
          </Form.Item>
        </Col>
      </Row>

      {/* الرصيد والحالة */}
      <Divider />
      <Row gutter={[16, 0]} align="middle">
        <Col xs={24} md={12}>
          <Form.Item
            name="openingBalance"
            label={tForm("OpeningBalance")}
            extra={tForm(config.balanceHint)}
          >
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="isActive"
            label={tForm("Active")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
};

export default PartyForm;
