"use client";

import { useState } from "react";
import {
  Form,
  Input,
  Select,
  Button,
  Switch,
  InputNumber,
  Row,
  Col,
} from "antd";
import { message } from "@/components/common/feedback";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import ImageUploadItem from "@/components/common/ImageUploadItem";
import {
  createProductAction,
  updateProductAction,
} from "@/actions/product.actions";
import { applyFieldErrors } from "@/lib/form-errors";
import { imageUrl } from "@/lib/image";
import AdditionalUnitsForm from "./AdditionalUnitsForm";
import { EXEMPTION_CODES } from "@/lib/zatca-tax";
import "./productForm.css";

// فورم المنتج (نفس الفورم للإضافة والتعديل)
// mode: "add" أو "edit"
// product: المنتج المراد تعديله (في وضع التعديل فقط)
// categories, units: قوائم الاختيار (تصل من السيرفر)
// defaults: من الإعدادات العامة (نسبة الضريبة ووضع السعر للصنف الجديد)
const ProductForm = ({
  mode = "add",
  product = null,
  categories = [],
  units = [],
  defaults = null,
}) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const isEdit = mode === "edit";

  const tForm = useTranslations("Form");
  const tButtons = useTranslations("Buttons");
  const tAlerts = useTranslations("Alerts");
  const tHeadings = useTranslations("Headings");

  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);

  // الصنف بنسبة 0: لازم فئة وسبب إعفاء (الفوترة الإلكترونية)
  const taxRateValue = Form.useWatch("taxRate", form);
  const taxCategory = Form.useWatch("taxCategory", form);
  const zeroRate = taxRateValue !== undefined && !(Number(taxRateValue) > 0);

  // القسم الفرعي يظهر مع اسم أبيه: "ملابس / رجالي"
  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.parent ? `${nameOf(c.parent)} / ${nameOf(c)}` : nameOf(c),
  }));

  const unitOptions = units.map((u) => ({ value: u.id, label: nameOf(u) }));

  // القيم الأولية: من المنتج (تعديل) أو قيم افتراضية (إضافة)
  const initialValues = isEdit
    ? {
        code: product.code,
        arName: product.arName,
        enName: product.enName,
        categoryId: product.categoryId,
        baseUnitId: product.baseUnitId,
        cost: product.cost,
        price: product.price,
        wholesalePrice: product.wholesalePrice,
        startStock: product.startStock,
        taxRate: product.taxRate,
        taxCategory: product.taxRate > 0 ? "S" : product.taxCategory || "O",
        taxExemptionCode: product.taxExemptionCode ?? undefined,
        taxExemptionReason: product.taxExemptionReason ?? "",
        isPriceIncludeTax: product.isPriceIncludeTax,
        isActive: product.isActive,
        image: product.image
          ? [
              {
                uid: "-1",
                name: product.image.split("/").pop(),
                status: "done",
                url: imageUrl(product.image),
              },
            ]
          : [],
        units: product.productUnits.map((pu) => ({
          unitId: pu.unitId,
          conversionFactor: pu.conversionFactor,
          barcode: pu.barcode,
          price: pu.price,
          cost: pu.cost,
          startStock: pu.startStock || null,
        })),
      }
    : {
        code: "",
        arName: "",
        enName: "",
        categoryId: undefined,
        baseUnitId: undefined,
        cost: 0,
        price: 0,
        wholesalePrice: 0,
        startStock: 0,
        taxRate: defaults?.taxRate ?? 15,
        isPriceIncludeTax: defaults?.priceIncludesTax ?? false,
        taxCategory: (defaults?.taxRate ?? 15) > 0 ? "S" : "O",
        taxExemptionCode: undefined,
        taxExemptionReason: "",
        isActive: true,
        image: [],
        units: [],
      };

  const onFinish = async (values) => {
    // FormData لأن فيها صورة. كل القيم تتحول لنصوص، والسيرفر يرجّعها لأنواعها
    const formData = new FormData();
    if (isEdit) formData.append("id", product.id);

    formData.append("code", values.code);
    formData.append("arName", values.arName);
    formData.append("enName", values.enName);
    formData.append("categoryId", values.categoryId);
    formData.append("baseUnitId", values.baseUnitId);
    formData.append("cost", values.cost ?? 0);
    formData.append("price", values.price ?? 0);
    formData.append("wholesalePrice", values.wholesalePrice ?? 0);
    formData.append("startStock", values.startStock ?? 0);
    formData.append("taxRate", values.taxRate ?? 0);
    formData.append("isPriceIncludeTax", String(values.isPriceIncludeTax));
    // فئة الضريبة (للفوترة الإلكترونية): للأصناف بنسبة 0 فقط
    const zeroRate = !(Number(values.taxRate) > 0);
    formData.append("taxCategory", zeroRate ? values.taxCategory || "" : "S");
    formData.append(
      "taxExemptionCode",
      zeroRate ? values.taxExemptionCode || "" : "",
    );
    formData.append(
      "taxExemptionReason",
      zeroRate ? values.taxExemptionReason || "" : "",
    );
    formData.append("isActive", String(values.isActive));

    // الوحدات الإضافية: قائمة كائنات، فنرسلها كنص JSON
    const productUnits = (values.units ?? []).map((u) => ({
      unitId: u.unitId,
      conversionFactor: u.conversionFactor,
      barcode: u.barcode || null,
      price: u.price,
      cost: u.cost ?? 0,
      startStock: u.startStock ?? 0,
    }));
    formData.append("units", JSON.stringify(productUnits));

    // الصورة: جديدة، أو شال الحالية، أو كما هي
    const fileList = values.image ?? [];
    const newFile = fileList[0]?.originFileObj;
    if (newFile) formData.append("image", newFile);
    else if (isEdit && product.image && fileList.length === 0) {
      formData.append("removeImage", "true");
    }

    setSaving(true);
    const res = isEdit
      ? await updateProductAction(formData)
      : await createProductAction(formData);
    setSaving(false);

    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      // لو الباركود مكرر نعرض قيمته
      const extra = res.details?.length ? `: ${res.details.join("، ")}` : "";
      message.error(`${tAlerts(res.error)}${extra}`);
      return;
    }

    message.success(tAlerts(isEdit ? "ProductUpdated" : "ProductAdded"));
    router.push("/products");
  };

  const numberStyle = { width: "100%", height: 40 };
  const nameRules = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
    { min: 3, message: tAlerts("MinCharcters") },
    { max: 150, message: tAlerts("TextTooLong") },
  ];

  return (
    <div>
      <h1 className="text-center font-bold text-lg mb-5 underline underline-offset-8">
        {tHeadings(isEdit ? "EditProductHeading" : "AddProductHeading")}
      </h1>

      <Form
        name="ProductForm"
        className="add-product-form"
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onFinish={onFinish}
        autoComplete="off"
      >
        <Row gutter={[16, 16]}>
          {/* الكود = باركود الوحدة الأساسية */}
          <Col xs={24} sm={24} md={8} lg={4}>
            <Form.Item
              name="code"
              label={tForm("Code")}
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: tAlerts("RequiredField"),
                },
                { max: 50, message: tAlerts("TextTooLong") },
              ]}
              hasFeedback
            >
              <Input />
            </Form.Item>
          </Col>

          <Col xs={24} sm={24} md={8} lg={8}>
            <Form.Item
              name="arName"
              label={tForm("ArName")}
              rules={nameRules}
              hasFeedback
            >
              <Input />
            </Form.Item>
          </Col>

          <Col xs={24} sm={24} md={8} lg={8}>
            <Form.Item
              name="enName"
              label={tForm("EnName")}
              rules={nameRules}
              hasFeedback
            >
              <Input />
            </Form.Item>
          </Col>

          <Col xs={24} sm={24} md={6} lg={4}>
            <Form.Item
              name="categoryId"
              label={tForm("Category")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
              hasFeedback
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={categoryOptions}
              />
            </Form.Item>
          </Col>

          <Col xs={24} sm={24} md={6} lg={4}>
            <Form.Item
              name="baseUnitId"
              label={tForm("BaseUnit")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
              hasFeedback
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={unitOptions}
              />
            </Form.Item>
          </Col>

          {/* الأسعار للوحدة الأساسية */}
          <Col xs={12} sm={12} md={6} lg={3}>
            <Form.Item
              name="cost"
              label={tForm("Cost")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <InputNumber min={0} style={numberStyle} />
            </Form.Item>
          </Col>

          <Col xs={12} sm={12} md={6} lg={3}>
            <Form.Item
              name="price"
              label={tForm("Price")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <InputNumber min={0} style={numberStyle} />
            </Form.Item>
          </Col>

          <Col xs={12} sm={12} md={6} lg={3}>
            <Form.Item name="wholesalePrice" label={tForm("WholesalePrice")}>
              <InputNumber min={0} style={numberStyle} />
            </Form.Item>
          </Col>

          <Col xs={12} sm={12} md={6} lg={3}>
            <Form.Item name="startStock" label={tForm("StartStock")}>
              <InputNumber min={0} step={1} style={numberStyle} />
            </Form.Item>
          </Col>

          <Col xs={12} sm={12} md={6} lg={3}>
            <Form.Item name="taxRate" label={tForm("TaxRate")}>
              <InputNumber min={0} max={100} suffix="%" style={numberStyle} />
            </Form.Item>
          </Col>

          {zeroRate && (
            <>
              <Col xs={24} sm={12} md={6} lg={4}>
                <Form.Item
                  name="taxCategory"
                  label={tForm("TaxCategory")}
                  tooltip={tForm("TaxCategoryHint")}
                  rules={[
                    { required: true, message: tAlerts("RequiredField") },
                  ]}
                >
                  <Select
                    onChange={() =>
                      form.setFieldValue("taxExemptionCode", undefined)
                    }
                    options={["Z", "E", "O"].map((c) => ({
                      value: c,
                      label: tForm(`taxCategory.${c}`),
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={10} lg={7}>
                <Form.Item
                  name="taxExemptionCode"
                  label={tForm("ExemptionReason")}
                  rules={[
                    {
                      required: true,
                      message: tAlerts("ExemptionCodeRequired"),
                    },
                  ]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={(EXEMPTION_CODES[taxCategory] ?? []).map((x) => ({
                      value: x.code,
                      label: `${locale === "ar" ? x.ar : x.en} (${x.code})`,
                    }))}
                  />
                </Form.Item>
              </Col>
              {taxCategory === "O" && (
                <Col xs={24} sm={24} md={8} lg={6}>
                  <Form.Item
                    name="taxExemptionReason"
                    label={tForm("ExemptionReasonText")}
                    rules={[{ max: 255, message: tAlerts("TextTooLong") }]}
                  >
                    <Input placeholder={tForm("ExemptionReasonTextHint")} />
                  </Form.Item>
                </Col>
              )}
            </>
          )}

          {/* الصورة اختيارية */}
          <Col xs={24} sm={24} md={6} lg={5}>
            <ImageUploadItem name="image" label={tForm("Image")} />
          </Col>

          <Col xs={24} sm={12} md={8} lg={4} className="flex items-center">
            <Form.Item
              name="isPriceIncludeTax"
              valuePropName="checked"
              label={tForm("PriceIncludeTax")}
              layout="horizontal"
              className="w-full mb-0"
            >
              <Switch />
            </Form.Item>
          </Col>

          <Col xs={24} sm={12} md={8} lg={4} className="flex items-center">
            <Form.Item
              name="isActive"
              label={tForm("Active")}
              valuePropName="checked"
              layout="horizontal"
              className="w-full mb-0"
            >
              <Switch />
            </Form.Item>
          </Col>

          {/* الوحدات الإضافية (علبة، كرتونة ...) */}
          <Col xs={24}>
            <h3 className="font-bold mb-3">{tHeadings("MoreUnitsHeading")}</h3>
            <AdditionalUnitsForm form={form} units={units} />
            <OpeningSummary form={form} units={units} nameOf={nameOf} />
          </Col>
        </Row>

        {/* الأزرار */}
        <div className="flex flex-wrap justify-end gap-5 mx-2 my-4">
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            loading={saving}
            style={{
              height: 50,
              width: 150,
              fontSize: 20,
              backgroundColor: "#30336b",
            }}
          >
            {isEdit ? tButtons("Save") : tButtons("Add")}
          </Button>

          {isEdit ? (
            <Button
              size="large"
              onClick={() => router.push("/products")}
              style={{ height: 50, width: 150, fontSize: 20 }}
            >
              {tButtons("Cancel")}
            </Button>
          ) : (
            <Button
              variant="solid"
              color="danger"
              size="large"
              onClick={() => form.resetFields()}
              style={{ height: 50, width: 150, fontSize: 20 }}
            >
              {tButtons("Reset")}
            </Button>
          )}
        </div>
      </Form>
    </div>
  );
};

// إجمالي الرصيد الافتتاحي بالوحدة الأساسية:
// 5 حبة + 10 كرتونة × 24 + 3 شدة × 6 = 263 حبة
function OpeningSummary({ form, units, nameOf }) {
  const tHeadings = useTranslations("Headings");
  const tCard = useTranslations("ProductCard");
  const startStock = Form.useWatch("startStock", form) ?? 0;
  const baseUnitId = Form.useWatch("baseUnitId", form);
  const lines = Form.useWatch("units", form) ?? [];
  const unitName = (id) => {
    const u = units.find((x) => x.id === id);
    return u ? nameOf(u) : "";
  };
  const parts = lines.filter(
    (l) =>
      l?.unitId && Number(l.startStock) > 0 && Number(l.conversionFactor) > 0,
  );
  if (!parts.length) return null;
  const total =
    Math.round(
      (Number(startStock) +
        parts.reduce(
          (s, l) => s + Number(l.startStock) * Number(l.conversionFactor),
          0,
        )) *
        1000,
    ) / 1000;
  const base = unitName(baseUnitId);
  const pieces = [
    ...(Number(startStock) > 0 ? [`${Number(startStock)} ${base}`] : []),
    ...parts.map(
      (l) =>
        `${Number(l.startStock)} ${unitName(l.unitId)} × ${Number(l.conversionFactor)}`,
    ),
  ];
  return (
    <div
      className="mb-4"
      style={{
        background: "#ecfdf5",
        border: "1px solid #a7f3d0",
        borderRadius: 8,
        padding: "8px 12px",
      }}
      title={tCard("OpeningTotalHint")}
    >
      {tHeadings("OpeningTotal")}: {pieces.join(" + ")} ={" "}
      <b>
        {total} {base}
      </b>
    </div>
  );
}

export default ProductForm;
