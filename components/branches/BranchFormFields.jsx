"use client";
import { Col, Divider, Form, Input, Row, Select, Switch } from "antd";
import { useLocale, useTranslations } from "next-intl";

// القيم المرسلة للسيرفر من فورم الفرع (مشتركة بين الإضافة والتعديل)
export const branchPayload = (values) => ({
  arName: values.arName,
  enName: values.enName,
  address: values.address,
  isActive: values.isActive,
  phone: values.phone ?? "",
  registrationNo: values.registrationNo ?? "",
  city: values.city ?? "",
  district: values.district ?? "",
  street: values.street ?? "",
  buildingNo: values.buildingNo ?? "",
  additionalNo: values.additionalNo ?? "",
  postalCode: values.postalCode ?? "",
  warehouseId: values.warehouseId ?? null,
  priceListId: values.priceListId ?? null,
});

// قيم الفورم من بيانات الفرع
export const branchFormValues = (branch) => ({
  arName: branch?.arName ?? "",
  enName: branch?.enName ?? "",
  address: branch?.address ?? "",
  isActive: branch?.isActive ?? true,
  phone: branch?.phone ?? "",
  registrationNo: branch?.registrationNo ?? "",
  city: branch?.city ?? "",
  district: branch?.district ?? "",
  street: branch?.street ?? "",
  buildingNo: branch?.buildingNo ?? "",
  additionalNo: branch?.additionalNo ?? "",
  postalCode: branch?.postalCode ?? "",
  warehouseId: branch?.warehouseId ?? undefined,
  priceListId: branch?.priceListId ?? undefined,
});

// حقول فورم الفرع (مشتركة بين الإضافة والتعديل)
// warehouses / priceLists: قوائم الاختيار
export default function BranchFormFields({
  tForm,
  tAlerts,
  warehouses = [],
  priceLists = [],
}) {
  const locale = useLocale();
  const t = useTranslations("Branches");
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);

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
      <Row gutter={[12, 0]}>
        <Col xs={24} sm={12}>
          <Form.Item label={tForm("ArName")} name="arName" rules={nameRules}>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label={tForm("EnName")} name="enName" rules={nameRules}>
            <Input dir="ltr" />
          </Form.Item>
        </Col>
        <Col xs={24}>
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
            <Input.TextArea rows={1} autoSize={{ minRows: 1, maxRows: 3 }} />
          </Form.Item>
        </Col>
      </Row>

      {/* ============ المستودع وقائمة الأسعار ============ */}
      <Divider titlePlacement="start" plain>
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
              options={warehouses.map((w) => ({
                value: w.id,
                label: nameOf(w),
              }))}
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

      {/* ============ بيانات الفاتورة ============ */}
      <Divider titlePlacement="start" plain>
        {t("InvoiceData")}
      </Divider>
      <p className="text-gray-500 mb-3" style={{ fontSize: 13 }}>
        {t("InvoiceDataHint")}
      </p>
      <Row gutter={[12, 0]}>
        <Col xs={24} sm={12}>
          <Form.Item label={t("Phone")} name="phone">
            <Input dir="ltr" maxLength={20} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            label={t("RegistrationNo")}
            name="registrationNo"
            rules={digits(10, "RegistrationNoInvalid")}
          >
            <Input dir="ltr" maxLength={10} />
          </Form.Item>
        </Col>
        <Col xs={12} sm={8}>
          <Form.Item label={t("City")} name="city">
            <Input maxLength={100} />
          </Form.Item>
        </Col>
        <Col xs={12} sm={8}>
          <Form.Item label={t("District")} name="district">
            <Input maxLength={100} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item label={t("Street")} name="street">
            <Input maxLength={100} />
          </Form.Item>
        </Col>
        <Col xs={8}>
          <Form.Item
            label={t("BuildingNo")}
            name="buildingNo"
            rules={digits(4, "BuildingNoInvalid")}
          >
            <Input dir="ltr" maxLength={4} />
          </Form.Item>
        </Col>
        <Col xs={8}>
          <Form.Item
            label={t("AdditionalNo")}
            name="additionalNo"
            rules={digits(4, "AdditionalNoInvalid")}
          >
            <Input dir="ltr" maxLength={4} />
          </Form.Item>
        </Col>
        <Col xs={8}>
          <Form.Item
            label={t("PostalCode")}
            name="postalCode"
            rules={digits(5, "PostalCodeInvalid")}
          >
            <Input dir="ltr" maxLength={5} />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        name="isActive"
        label={tForm("Active")}
        valuePropName="checked"
      >
        <Switch />
      </Form.Item>
    </>
  );
}
