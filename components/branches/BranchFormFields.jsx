"use client";
import { Col, Divider, Form, Input, Row, Select, Switch, Tooltip } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { C } from "@/lib/theme";
import { SELLER_ID_SCHEMES, idValid } from "@/lib/zatca-tax";
import { useLocale, useTranslations } from "next-intl";
import PhoneField from "@/components/common/PhoneField";

// القيم المرسلة للسيرفر من فورم الفرع (مشتركة بين الإضافة والتعديل)
export const branchPayload = (values) => ({
  arName: values.arName,
  enName: values.enName,
  code: values.code ?? "",
  address: values.address,
  isActive: values.isActive,
  phone: values.phone ?? "",
  idScheme: values.idScheme ?? "CRN",
  registrationNo: values.registrationNo ?? "",
  city: values.city ?? "",
  district: values.district ?? "",
  street: values.street ?? "",
  buildingNo: values.buildingNo ?? "",
  additionalNo: values.additionalNo ?? "",
  postalCode: values.postalCode ?? "",
  // «مستودع جديد باسم الفرع» ← السيرفر بيعمله ويربطه
  warehouseId: values.warehouseId === NEW_WAREHOUSE ? null : (values.warehouseId ?? null),
  newWarehouse: values.warehouseId === NEW_WAREHOUSE,
  priceListId: values.priceListId ?? null,
});

// اختيار «مستودع جديد باسم الفرع» في قائمة المستودعات
export const NEW_WAREHOUSE = "new";

// قيم الفورم من بيانات الفرع
export const branchFormValues = (branch) => ({
  arName: branch?.arName ?? "",
  enName: branch?.enName ?? "",
  code: branch?.code ?? "",
  address: branch?.address ?? "",
  isActive: branch?.isActive ?? true,
  phone: branch?.phone ?? "",
  idScheme: branch?.idScheme ?? "CRN",
  registrationNo: branch?.registrationNo ?? "",
  city: branch?.city ?? "",
  district: branch?.district ?? "",
  street: branch?.street ?? "",
  buildingNo: branch?.buildingNo ?? "",
  additionalNo: branch?.additionalNo ?? "",
  postalCode: branch?.postalCode ?? "",
  // الفرع الجديد: مستودع جديد باسمه (الافتراضي) | الموجود: مستودعه (فاضي = الرئيسي)
  warehouseId: branch ? (branch.warehouseId ?? undefined) : NEW_WAREHOUSE,
  priceListId: branch?.priceListId ?? undefined,
});

// حقول فورم الفرع (مشتركة بين الإضافة والتعديل)
// warehouses / priceLists: قوائم الاختيار
// codeLocked: الفرع عليه مستندات مترقّمة ← الرمز مقفول
export default function BranchFormFields({
  tForm,
  tAlerts,
  warehouses = [],
  priceLists = [],
  codeLocked = false,
}) {
  const locale = useLocale();
  const t = useTranslations("Branches");
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);
  const idScheme = Form.useWatch("idScheme");

  const nameRules = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
    { min: 3, message: tAlerts("MinCharcters") },
    { max: 100, message: tAlerts("TextTooLong") },
  ];
  const digits = (len, code) => [
    { pattern: new RegExp(`^\\d{${len}}$`), message: tAlerts(code) },
  ];

  return (
    <>
      {/* الاسم والعنوان والحالة في سطر واحد */}
      <Row gutter={[12, 0]}>
        <Col xs={24} sm={12} lg={6}>
          <Form.Item label={tForm("ArName")} name="arName" rules={nameRules}>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Form.Item label={tForm("EnName")} name="enName" rules={nameRules}>
            <Input dir="ltr" />
          </Form.Item>
        </Col>
        {/* رمز الفرع قبل أرقام المستندات (DM-SI-5) */}
        <Col xs={8} sm={6} lg={3}>
          <Form.Item
            label={t("Code")}
            name="code"
            tooltip={codeLocked ? t("CodeLockedHint") : t("CodeHint")}
            normalize={(v) => (v ? v.toUpperCase() : v)}
            rules={[{ pattern: /^[A-Z][A-Z0-9]{0,5}$/, message: tAlerts("BranchCodeInvalid") }]}
          >
            <Input
              dir="ltr"
              maxLength={6}
              disabled={codeLocked}
              placeholder={t("CodeAuto")}
            />
          </Form.Item>
        </Col>
        <Col xs={16} sm={18} lg={6}>
          <Form.Item
            label={tForm("Address")}
            name="address"
            rules={[
              {
                required: true,
                whitespace: true,
                message: tAlerts("RequiredField"),
              },
              { max: 255, message: tAlerts("TextTooLong") },
            ]}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col xs={6} sm={6} lg={3}>
          <Form.Item
            name="isActive"
            label={tForm("Active")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
      </Row>

      {/* ============ المستودع وقائمة الأسعار ============ */}
      <Divider titlePlacement="start" plain style={{ margin: "4px 0 12px" }}>
        {t("StockAndPrices")}
      </Divider>
      <Row gutter={[12, 0]}>
        <Col xs={24} sm={12}>
          <Form.Item
            label={t("Warehouse")}
            name="warehouseId"
            tooltip={t("WarehouseHint")}
          >
            <Select
              allowClear
              placeholder={t("MainWarehouseDefault")}
              options={[
                { value: NEW_WAREHOUSE, label: t("NewBranchWarehouse") },
                ...warehouses.map((w) => ({
                  value: w.id,
                  label: nameOf(w),
                })),
              ]}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            label={t("PriceList")}
            name="priceListId"
            tooltip={t("PriceListHint")}
          >
            <Select
              allowClear
              placeholder={t("BasePrices")}
              options={priceLists.map((p) => ({
                value: p.id,
                label: nameOf(p),
              }))}
            />
          </Form.Item>
        </Col>
      </Row>

      {/* ============ بيانات الفاتورة (الشرح ❔) ============ */}
      <Divider titlePlacement="start" plain style={{ margin: "4px 0 12px" }}>
        <Tooltip title={t("InvoiceDataHint")}>
          <span>
            {t("InvoiceData")}{" "}
            <QuestionCircleOutlined style={{ color: C.muted }} />
          </span>
        </Tooltip>
      </Divider>
      <Row gutter={[12, 0]}>
        <Col xs={12} sm={12} lg={6}>
          <PhoneField label={t("Phone")} />
        </Col>
        {/* معرّف الفرع: النوع + الرقم (زي بيانات الشركة) */}
        <Col xs={12} sm={12} lg={6}>
          <Form.Item
            label={tForm("SellerIdScheme")}
            name="idScheme"
            tooltip={t("IdSchemeHint")}
          >
            <Select
              options={SELLER_ID_SCHEMES.map((code) => ({
                value: code,
                label: `${tForm(`idSchemes.${code}`)} (${code})`,
              }))}
            />
          </Form.Item>
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <Form.Item
            label={t(idScheme === "CRN" ? "RegistrationNo" : "IdNumber")}
            name="registrationNo"
            dependencies={["idScheme"]}
            rules={[
              {
                validator: (_, v) =>
                  !v || idValid(idScheme ?? "CRN", v)
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error(
                          tAlerts(
                            idScheme === "CRN"
                              ? "RegistrationNoInvalid"
                              : "IdNumberInvalid",
                          ),
                        ),
                      ),
              },
            ]}
          >
            <Input dir="ltr" maxLength={idScheme === "CRN" ? 10 : 30} />
          </Form.Item>
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <Form.Item label={t("City")} name="city">
            <Input maxLength={100} />
          </Form.Item>
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <Form.Item label={t("District")} name="district">
            <Input maxLength={100} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Form.Item label={t("Street")} name="street">
            <Input maxLength={100} />
          </Form.Item>
        </Col>
        <Col xs={8} sm={4} lg={4}>
          <Form.Item
            label={t("BuildingNo")}
            name="buildingNo"
            rules={digits(4, "BuildingNoInvalid")}
          >
            <Input dir="ltr" maxLength={4} />
          </Form.Item>
        </Col>
        <Col xs={8} sm={4} lg={4}>
          <Form.Item
            label={t("AdditionalNo")}
            name="additionalNo"
            rules={digits(4, "AdditionalNoInvalid")}
          >
            <Input dir="ltr" maxLength={4} />
          </Form.Item>
        </Col>
        <Col xs={8} sm={4} lg={4}>
          <Form.Item
            label={t("PostalCode")}
            name="postalCode"
            rules={digits(5, "PostalCodeInvalid")}
          >
            <Input dir="ltr" maxLength={5} />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}
