"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Upload,
} from "antd";
import { SELLER_ID_SCHEMES } from "@/lib/zatca-tax";
import { message } from "@/components/common/feedback";
import {
  BankOutlined,
  CreditCardOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  MailOutlined,
  PhoneOutlined,
  PictureOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { saveCompanyAction } from "@/actions/company.actions";
import { applyFieldErrors } from "@/lib/form-errors";
import { IMAGE_TYPES, MAX_IMAGE_SIZE_MB, imageUrl } from "@/lib/image";
import "./settings.css";

// يحوّل حدث الـ Upload إلى قائمة ملفات يحفظها الفورم
const normFile = (e) => (Array.isArray(e) ? e : e?.fileList);

// القيم الأولية للفورم من بيانات الشركة المحفوظة
const toFormValues = (company) => ({
  arName: company?.arName ?? "",
  enName: company?.enName ?? "",
  taxNo: company?.taxNo ?? "",
  registrationNo: company?.registrationNo ?? "",
  sellerIdScheme: company?.sellerIdScheme ?? "CRN",
  sellerIdNumber: company?.sellerIdNumber ?? "",
  phone: company?.phone ?? "",
  email: company?.email ?? "",
  bankName: company?.bankName ?? "",
  bankAccountName: company?.bankAccountName ?? "",
  bankAccountNumber: company?.bankAccountNumber ?? "",
  iban: company?.iban ?? "",
  city: company?.city ?? "",
  district: company?.district ?? "",
  street: company?.street ?? "",
  buildingNo: company?.buildingNo ?? "",
  additionalNo: company?.additionalNo ?? "",
  postalCode: company?.postalCode ?? "",
  // الشعار الحالي (لو موجود) يظهر في خانة الرفع برابطه
  logo: company?.logo
    ? [{ uid: "-1", name: "logo", status: "done", url: imageUrl(company.logo) }]
    : [],
});

// فورم بيانات الشركة
// company: البيانات المحفوظة (أو null أول مرة)
// canEdit: يملك صلاحية التعديل؟ (بدونها الفورم للقراءة فقط)
export default function CompanyForm({ company, canEdit }) {
  const [form] = Form.useForm();
  const sellerScheme = Form.useWatch("sellerIdScheme", form);
  const [saving, setSaving] = useState(false);
  const locale = useLocale();
  const tSidebar = useTranslations("Sidebar");
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");

  const onFinish = async (values) => {
    const formData = new FormData();
    for (const key of [
      "arName",
      "enName",
      "taxNo",
      "registrationNo",
      "sellerIdScheme",
      "sellerIdNumber",
      "phone",
      "email",
      "bankName",
      "bankAccountName",
      "bankAccountNumber",
      "iban",
      "city",
      "district",
      "street",
      "buildingNo",
      "additionalNo",
      "postalCode",
    ]) {
      formData.append(key, values[key] ?? "");
    }

    // الشعار: 3 حالات
    const fileList = values.logo ?? [];
    const newFile = fileList[0]?.originFileObj;
    if (newFile) {
      // 1) اختار شعاراً جديداً
      formData.append("logo", newFile);
    } else if (company?.logo && fileList.length === 0) {
      // 2) حذف الشعار الحالي
      formData.append("removeLogo", "true");
    }
    // 3) غير ذلك: الشعار كما هو

    setSaving(true);
    const res = await saveCompanyAction(formData);
    setSaving(false);

    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts("CompanySaved"));
    // نعيد تعبئة الفورم بالبيانات المحفوظة (منها رابط الشعار الجديد)
    form.setFieldsValue(toFormValues(res.data));
  };

  // التحقق من الشعار قبل إضافته (والسيرفر يتحقق مرة ثانية)
  const beforeUpload = (file) => {
    if (!IMAGE_TYPES.includes(file.type)) {
      message.error(tAlerts("AllowedImageTypes"));
      return Upload.LIST_IGNORE;
    }
    if (file.size / 1024 / 1024 > MAX_IMAGE_SIZE_MB) {
      message.error(tAlerts("ImageTooLarge"));
      return Upload.LIST_IGNORE;
    }
    return false; // لا ترفع الآن، احتفظ به حتى نضغط حفظ
  };

  const nameRules = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
    { min: 3, message: tAlerts("MinCharcters") },
    { max: 255, message: tAlerts("TextTooLong") },
  ];
  const maxText = (max) => [{ max, message: tAlerts("TextTooLong") }];
  const digits = (pattern, errorKey) => [
    { pattern, message: tAlerts(errorKey) },
  ];

  const lastUpdate = company?.updatedAt
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(company.updatedAt))
    : null;

  return (
    <div className="company-settings">
      {/* رأس الصفحة */}
      <div className="company-settings__header">
        <div>
          <h1 className="font-bold text-xl m-0">{tSidebar("CompanyData")}</h1>
          <p className="text-slate-500 m-0 mt-1 text-sm">
            {lastUpdate
              ? `${tForm("LastUpdate")}: ${lastUpdate}`
              : tForm("CompanyDataHint")}
          </p>
        </div>
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
      </div>

      {!company && (
        <Alert
          type="info"
          showIcon
          title={tAlerts("CompanyNotSet")}
          style={{ marginBottom: 16 }}
        />
      )}
      {!canEdit && (
        <Alert
          type="warning"
          showIcon
          title={tAlerts("ReadOnlyNoPermission")}
          style={{ marginBottom: 16 }}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
        onFinish={onFinish}
        disabled={!canEdit}
        initialValues={toFormValues(company)}
        requiredMark={false}
      >
        <Row gutter={[16, 16]}>
          {/* الشعار */}
          <Col xs={24} lg={7}>
            <Card
              title={
                <span>
                  <PictureOutlined /> {tForm("Logo")}
                </span>
              }
              className="h-full"
            >
              <Form.Item
                name="logo"
                valuePropName="fileList"
                getValueFromEvent={normFile}
                extra={tForm("LogoHint")}
                className="company-logo-item"
              >
                <Upload
                  listType="picture-card"
                  maxCount={1}
                  beforeUpload={beforeUpload}
                  accept=".png,.jpg,.jpeg,.webp"
                  className="company-logo-upload"
                >
                  <div className="flex flex-col items-center gap-1 text-slate-500">
                    <PlusOutlined style={{ fontSize: 22 }} />
                    <span>{tButtons("Upload")}</span>
                  </div>
                </Upload>
              </Form.Item>
            </Card>
          </Col>

          {/* البيانات الأساسية والقانونية */}
          <Col xs={24} lg={17}>
            <Card
              title={
                <span>
                  <BankOutlined /> {tForm("BasicInfo")}
                </span>
              }
              className="h-full"
            >
              <Row gutter={[16, 0]}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="arName"
                    label={tForm("CompanyArName")}
                    rules={nameRules}
                  >
                    <Input size="large" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="enName"
                    label={tForm("CompanyEnName")}
                    rules={nameRules}
                  >
                    <Input size="large" dir="ltr" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="taxNo"
                    label={tForm("TaxNo")}
                    rules={digits(/^\d{15}$/, "TaxNoInvalid")}
                  >
                    <Input
                      size="large"
                      inputMode="numeric"
                      maxLength={15}
                      dir="ltr"
                      prefix={<FileTextOutlined className="text-slate-400" />}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="registrationNo"
                    label={tForm("RegistrationNo")}
                    rules={digits(/^\d{10}$/, "RegistrationNoInvalid")}
                  >
                    <Input
                      size="large"
                      inputMode="numeric"
                      maxLength={10}
                      dir="ltr"
                      prefix={<FileTextOutlined className="text-slate-400" />}
                    />
                  </Form.Item>
                </Col>
                {/* معرّف البائع في الفاتورة الإلكترونية (الزكاة) */}
                <Col xs={24} md={12}>
                  <Form.Item
                    name="sellerIdScheme"
                    label={tForm("SellerIdScheme")}
                    tooltip={tForm("SellerIdSchemeHint")}
                  >
                    <Select
                      size="large"
                      options={SELLER_ID_SCHEMES.map((code) => ({
                        value: code,
                        label: `${tForm(`idSchemes.${code}`)} (${code})`,
                      }))}
                    />
                  </Form.Item>
                </Col>
                {sellerScheme && sellerScheme !== "CRN" && (
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="sellerIdNumber"
                      label={tForm("SellerIdNumber")}
                      rules={[
                        {
                          required: true,
                          whitespace: true,
                          message: tAlerts("RequiredField"),
                        },
                      ]}
                    >
                      <Input size="large" maxLength={30} dir="ltr" />
                    </Form.Item>
                  </Col>
                )}
                <Col xs={24} md={12}>
                  <Form.Item
                    name="phone"
                    label={tForm("Phone")}
                    rules={[
                      {
                        pattern: /^\+?\d{7,15}$/,
                        message: tAlerts("CompanyPhoneInvalid"),
                      },
                    ]}
                  >
                    <Input
                      size="large"
                      inputMode="tel"
                      maxLength={16}
                      dir="ltr"
                      prefix={<PhoneOutlined className="text-slate-400" />}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="email"
                    label={tForm("Email")}
                    rules={[
                      { type: "email", message: tAlerts("EmailInvalid") },
                      { max: 100, message: tAlerts("TextTooLong") },
                    ]}
                  >
                    <Input
                      size="large"
                      inputMode="email"
                      dir="ltr"
                      prefix={<MailOutlined className="text-slate-400" />}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>

          {/* العنوان الوطني */}
          <Col xs={24}>
            <Card
              title={
                <span>
                  <EnvironmentOutlined /> {tForm("NationalAddress")}
                </span>
              }
            >
              <Row gutter={[16, 0]}>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="city"
                    label={tForm("City")}
                    rules={maxText(100)}
                  >
                    <Input size="large" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="district"
                    label={tForm("District")}
                    rules={maxText(100)}
                  >
                    <Input size="large" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="street"
                    label={tForm("Street")}
                    rules={maxText(100)}
                  >
                    <Input size="large" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="buildingNo"
                    label={tForm("BuildingNo")}
                    rules={digits(/^\d{4}$/, "BuildingNoInvalid")}
                  >
                    <Input
                      size="large"
                      inputMode="numeric"
                      maxLength={4}
                      dir="ltr"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="additionalNo"
                    label={tForm("AdditionalNo")}
                    rules={digits(/^\d{4}$/, "AdditionalNoInvalid")}
                  >
                    <Input
                      size="large"
                      inputMode="numeric"
                      maxLength={4}
                      dir="ltr"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="postalCode"
                    label={tForm("PostalCode")}
                    rules={digits(/^\d{5}$/, "PostalCodeInvalid")}
                  >
                    <Input
                      size="large"
                      inputMode="numeric"
                      maxLength={5}
                      dir="ltr"
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>

          {/* الحساب البنكي */}
          <Col xs={24}>
            <Card
              title={
                <span>
                  <CreditCardOutlined /> {tForm("BankAccount")}
                </span>
              }
              extra={
                <span className="text-xs text-slate-400">
                  {tForm("BankAccountHint")}
                </span>
              }
            >
              <Row gutter={[16, 0]}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="bankName"
                    label={tForm("BankName")}
                    rules={maxText(100)}
                  >
                    <Input
                      size="large"
                      placeholder={tForm("BankNamePlaceholder")}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="bankAccountName"
                    label={tForm("BankAccountName")}
                    rules={maxText(150)}
                  >
                    <Input size="large" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="bankAccountNumber"
                    label={tForm("BankAccountNumber")}
                    rules={digits(/^\d{6,30}$/, "BankAccountInvalid")}
                  >
                    <Input
                      size="large"
                      inputMode="numeric"
                      maxLength={30}
                      dir="ltr"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="iban"
                    label={tForm("Iban")}
                    normalize={(v) => v?.replace(/\s+/g, "").toUpperCase()}
                    rules={digits(/^SA\d{22}$/, "IbanInvalid")}
                  >
                    <Input
                      size="large"
                      maxLength={24}
                      dir="ltr"
                      placeholder="SA0000000000000000000000"
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Form>
    </div>
  );
}
