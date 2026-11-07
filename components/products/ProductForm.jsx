"use client";

import { useEffect, useState } from "react";
import {
  Form,
  Input,
  Select,
  Button,
  Switch,
  InputNumber,
  Row,
  Col,
  Space,
} from "antd";
import { message } from "@/components/common/feedback";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { useModule } from "@/components/auth/AuthProvider";
import ImageUploadItem from "@/components/common/ImageUploadItem";
import {
  createProductAction,
  nextProductCodeAction,
  updateProductAction,
} from "@/actions/product.actions";
import { applyFieldErrors } from "@/lib/form-errors";
import { imageUrl } from "@/lib/image";
import AdditionalUnitsForm from "./AdditionalUnitsForm";
import VariantsFields, {
  EMPTY_VARIANTS,
  variantsPayload,
} from "./VariantsFields";
import { showActionError } from "@/components/common/actionError";
import { generateVariantsAction } from "@/actions/variant.actions";
import QuickAddLookup from "./QuickAddLookup";
import LaundryProductFields, { laundryPayload } from "./LaundryProductFields";
import { saveLaundryItemAction } from "@/actions/laundry.actions";
import { EXEMPTION_CODES } from "@/lib/zatca-tax";
import { listSep } from "@/lib/list-sep";
import { C } from "@/lib/theme";
import "./productForm.css";

// فورم المنتج (نفس الفورم للإضافة والتعديل)
// mode: "add" أو "edit"
// product: المنتج المراد تعديله (في وضع التعديل فقط)
// categories, units: قوائم الاختيار (تصل من السيرفر)
// defaults: من الإعدادات العامة (نسبة الضريبة ووضع السعر للصنف الجديد)
const ProductForm = ({
  mode = "add",
  product = null,
  categories: categoriesProp = [],
  units: unitsProp = [],
  defaults = null,
}) => {
  const [form] = Form.useForm();
  // الإضافة السريعة: القسم/الوحدة الجديدة تظهر في القائمة على طول
  const [added, setAdded] = useState({ categories: [], units: [] });
  const categories = [
    ...categoriesProp,
    ...added.categories.filter(
      (c) => !categoriesProp.some((x) => x.id === c.id),
    ),
  ];
  const units = [
    ...unitsProp,
    ...added.units.filter((u) => !unitsProp.some((x) => x.id === u.id)),
  ];
  const parentOf = (c) =>
    c.parent ?? categories.find((x) => x.id === c.parentId) ?? null;
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const tVariants = useTranslations("Variants");
  const tLaundry = useTranslations("Laundry");
  const isEdit = mode === "edit";
  // الكود التلقائي الجاي (يظهر في الخانة لو فاضية)
  const [nextCode, setNextCode] = useState(null);
  useEffect(() => {
    if (isEdit) return;
    let alive = true;
    nextProductCodeAction().then((res) => {
      if (!alive || !res.success) return;
      setNextCode(res.data);
      // الكود الجاي بيتكتب في الخانة (زي العملاء والموردين)، ويتغيّر عادي
      // (لو المستخدم لسه ماكتبش ولا مسح باركود)
      if (!form.getFieldValue("code")) form.setFieldValue("code", res.data);
    });
    return () => {
      alive = false;
    };
  }, [isEdit, form]);

  const tForm = useTranslations("Form");
  const tButtons = useTranslations("Buttons");
  const tAlerts = useTranslations("Alerts");
  const tHeadings = useTranslations("Headings");
  const tSerial = useTranslations("Serials");
  // الأرقام التسلسلية والضمان (لو الوحدة مفعّلة للشركة)
  const serialsOn = useModule("serials");
  // المتابعة الدورية (وحدة followUps)
  const followUpsOn = useModule("followUps");
  const followUpDays = Form.useWatch("followUpDays", form) ?? 0;
  // التغيير الدوري للسيارات (وحدة vehicles): زيت، فلتر...
  const vehiclesOn = useModule("vehicles");
  const changeKm = Form.useWatch("changeKm", form) ?? 0;
  const changeMonths = Form.useWatch("changeMonths", form) ?? 0;
  const hasChange = changeKm > 0 || changeMonths > 0;
  // مدة الخدمة (وحدة bookings)
  const bookingsOn = useModule("bookings");
  // المغسلة (وحدة laundry): الخدمة قطعة مغسلة (ثوب، شماغ...) + أسعارها
  const laundryOn = useModule("laundry");
  // المقاسات والألوان (وحدة variants): في الإضافة بس، والحفظ بيعمل المقاسات معاه
  const variantsOn = useModule("variants");
  const [vf, setVf] = useState(EMPTY_VARIANTS);
  const withSizes = variantsOn && !isEdit && vf.sizes.length > 0;
  const serialCount = Form.useWatch("serialCount", form) ?? 0;
  // خدمة (مصنعية، تركيب...): من غير رصيد افتتاحي ولا أرقام تسلسلية
  const isService = Form.useWatch("isService", form) ?? false;
  const warrantyMonths = Form.useWatch("warrantyMonths", form) ?? 0;

  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);

  // الصنف بنسبة 0: لازم فئة وسبب إعفاء (الفوترة الإلكترونية)
  const taxRateValue = Form.useWatch("taxRate", form);
  const taxCategory = Form.useWatch("taxCategory", form);
  const zeroRate = taxRateValue !== undefined && !(Number(taxRateValue) > 0);

  // القسم الفرعي يظهر مع اسم أبيه: "ملابس / رجالي"
  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: parentOf(c) ? `${nameOf(parentOf(c))} / ${nameOf(c)}` : nameOf(c),
  }));
  // الأقسام الرئيسية (القسم الأب في نافذة القسم الجديد)
  const mainCategories = categories.filter((c) => !parentOf(c));

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
        isService: product.isService ?? false,
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
        serialCount: product.serialCount ?? 0,
        serialLabel1: product.serialLabel1 ?? "",
        serialLabel2: product.serialLabel2 ?? "",
        warrantyMonths: product.warrantyMonths ?? 0,
        followUpDays: product.followUpDays ?? 0,
        changeKm: product.changeKm ?? 0,
        changeMonths: product.changeMonths ?? 0,
        durationMin: product.durationMin ?? 0,
        warrantyType: product.warrantyType ?? "store",
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
        isService: false,
        image: [],
        units: [],
        serialCount: 0,
        serialLabel1: "",
        serialLabel2: "",
        warrantyMonths: 0,
        followUpDays: 0,
        changeKm: 0,
        changeMonths: 0,
        durationMin: 0,
        warrantyType: "store",
      };

  // التعديل: لما بيانات الصنف تتحدث من السيرفر الفورم يرجع لها
  // (مش للقيم القديمة اللي فضلت في الصفحة المحفوظة في الخلفية)
  // (بالمحتوى مش بالكائن: تحديث الصفحة بعد إضافة قسم/وحدة سريعة ميمسحش التعديلات)
  const productKey = isEdit ? JSON.stringify(product) : "";
  useEffect(() => {
    if (isEdit) form.resetFields();
  }, [productKey, isEdit, form]);

  const onFinish = async (values) => {
    // FormData لأن فيها صورة. كل القيم تتحول لنصوص، والسيرفر يرجّعها لأنواعها
    const formData = new FormData();
    if (isEdit) formData.append("id", product.id);

    formData.append("code", values.code);
    formData.append("arName", values.arName);
    formData.append("enName", values.enName);
    formData.append("categoryId", values.categoryId ?? "");
    formData.append("baseUnitId", isService ? "" : (values.baseUnitId ?? ""));
    formData.append("cost", values.cost ?? 0);
    formData.append("price", values.price ?? 0);
    formData.append("wholesalePrice", values.wholesalePrice ?? 0);
    // المقاسات: الرصيد الافتتاحي من شبكة المقاسات
    formData.append("startStock", withSizes ? 0 : (values.startStock ?? 0));
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
    formData.append("isService", String(Boolean(values.isService)));
    // الأرقام التسلسلية والضمان (الوحدة مقفولة: السيرفر بيتجاهلها)
    if (followUpsOn)
      formData.append(
        "followUpDays",
        isService ? 0 : (values.followUpDays ?? 0),
      );
    if (bookingsOn)
      formData.append("durationMin", isService ? (values.durationMin ?? 0) : 0);
    if (vehiclesOn) {
      formData.append("changeKm", values.changeKm ?? 0);
      formData.append("changeMonths", values.changeMonths ?? 0);
    }
    if (serialsOn) {
      formData.append("serialCount", values.serialCount ?? 0);
      formData.append("serialLabel1", values.serialLabel1 || "");
      formData.append("serialLabel2", values.serialLabel2 || "");
      formData.append("warrantyMonths", values.warrantyMonths ?? 0);
      formData.append("warrantyType", values.warrantyType || "");
    }

    // الوحدات الإضافية: قائمة كائنات، فنرسلها كنص JSON
    const productUnits = (isService ? [] : (values.units ?? [])).map((u) => ({
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
      const extra = res.details?.length ? `: ${res.details.join(listSep(locale))}` : "";
      message.error(`${tAlerts(res.error)}${extra}`);
      return;
    }

    // المغسلة: الصنف اتحفظ ← نحفظ إنه قطعة مغسلة وأسعارها
    const laundry = laundryOn
      ? laundryPayload(values, isEdit ? product.id : res.data.id)
      : null;
    if (laundry) {
      const lr = await saveLaundryItemAction(laundry);
      if (!lr.success) showActionError(lr, tAlerts, locale);
    }

    // المقاسات: الصنف اتعمل ← نولّد مقاساته (وألوانه ورصيدها)
    if (withSizes && !isService) {
      const gen = await generateVariantsAction({
        productId: res.data.id,
        ...variantsPayload(vf),
      });
      if (!gen.success) showActionError(gen, tAlerts, locale);
      else message.success(tVariants("Generated", { n: gen.data.created }));
      setVf(EMPTY_VARIANTS);
    }

    message.success(tAlerts(isEdit ? "ProductUpdated" : "ProductAdded"));
    if (isEdit) {
      form.resetFields();
      router.push("/products");
      return;
    }
    // الإضافة: الشاشة تفضل مفتوحة لصنف جديد (ممكن يضيف كذا صنف ورا بعض)
    // والقسم والوحدة الأساسية يفضلوا زي ما هم (غالباً الأصناف اللي بعدها من نفس القسم)
    form.resetFields();
    form.setFieldsValue({
      categoryId: values.categoryId,
      baseUnitId: values.baseUnitId,
      // المغسلة: غالباً القطعة اللي بعدها قطعة مغسلة كمان
      ...(laundry?.laundryItem ? { isService: true, laundryItem: true } : {}),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
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
              tooltip={isEdit ? undefined : tForm("CodeAutoHint")}
              rules={[
                // الإضافة: فاضي = تلقائي | التعديل: لازم
                ...(isEdit
                  ? [
                      {
                        required: true,
                        whitespace: true,
                        message: tAlerts("RequiredField"),
                      },
                    ]
                  : []),
                { max: 50, message: tAlerts("TextTooLong") },
              ]}
              hasFeedback
            >
              <Input
                placeholder={
                  !isEdit && nextCode ? tForm("CodeAuto", { code: nextCode }) : undefined
                }
              />
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

          {/* خدمة: بتتباع ومالهاش مخزون */}
          <Col xs={24} sm={12} md={8} lg={4}>
            <Form.Item
              name="isService"
              label={tForm("IsService")}
              tooltip={tForm("IsServiceHint")}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} sm={24} md={6} lg={4}>
            <Form.Item
              label={tForm("Category")}
              required={!isService}
              extra={isService ? tForm("ServiceCategoryHint") : null}
            >
              {/* القسم + زرار إضافة قسم جديد من غير ما تسيب الصنف */}
              <Space.Compact style={{ width: "100%" }}>
                <Form.Item
                  name="categoryId"
                  noStyle
                  dependencies={["isService"]}
                  rules={[
                    { required: !isService, message: tAlerts("RequiredField") },
                  ]}
                >
                  <Select
                    showSearch
                    allowClear={isService}
                    optionFilterProp="label"
                    placeholder={
                      isService ? tForm("ServiceCategoryAuto") : null
                    }
                    options={categoryOptions}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
                <QuickAddLookup
                  kind="category"
                  mainCategories={mainCategories}
                  onCreated={(c) => {
                    setAdded((p) => ({
                      ...p,
                      categories: [...p.categories, c],
                    }));
                    form.setFieldValue("categoryId", c.id);
                    form.validateFields(["categoryId"]).catch(() => {});
                  }}
                />
              </Space.Compact>
            </Form.Item>
          </Col>

          {/* الخدمة: الوحدة "خدمة" تلقائي */}
          {!isService && (
            <Col xs={24} sm={24} md={6} lg={4}>
              <Form.Item label={tForm("BaseUnit")} required>
                {/* الوحدة + زرار إضافة وحدة جديدة */}
                <Space.Compact style={{ width: "100%" }}>
                  <Form.Item
                    name="baseUnitId"
                    noStyle
                    rules={[
                      { required: true, message: tAlerts("RequiredField") },
                    ]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={unitOptions}
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                  <QuickAddLookup
                    kind="unit"
                    onCreated={(u) => {
                      setAdded((p) => ({ ...p, units: [...p.units, u] }));
                      form.setFieldValue("baseUnitId", u.id);
                      form.validateFields(["baseUnitId"]).catch(() => {});
                    }}
                  />
                </Space.Compact>
              </Form.Item>
            </Col>
          )}

          {/* الأسعار للوحدة الأساسية */}
          {!isService && (
            <Col xs={12} sm={12} md={6} lg={3}>
              <Form.Item
                name="cost"
                label={tForm("Cost")}
                rules={[{ required: true, message: tAlerts("RequiredField") }]}
              >
                <InputNumber min={0} style={numberStyle} />
              </Form.Item>
            </Col>
          )}

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

          {!isService && (
            <Col xs={12} sm={12} md={6} lg={3}>
              <Form.Item name="startStock" label={tForm("StartStock")}>
                <InputNumber min={0} step={1} style={numberStyle} />
              </Form.Item>
            </Col>
          )}

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

          {/* السويتشات جنب بعض في سطر واحد: شامل الضريبة، نشط، قطعة مغسلة */}
          <Col xs={24} md={18} lg={12} className="flex items-center">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 w-full">
              <Form.Item
                name="isPriceIncludeTax"
                valuePropName="checked"
                label={tForm("PriceIncludeTax")}
                layout="horizontal"
                className="mb-0"
              >
                <Switch />
              </Form.Item>
              <Form.Item
                name="isActive"
                label={tForm("Active")}
                valuePropName="checked"
                layout="horizontal"
                className="mb-0"
              >
                <Switch />
              </Form.Item>
              {/* المغسلة (وحدة laundry): الخدمة قطعة مغسلة (أسعارها تحت) */}
              {laundryOn && isService && (
                <Form.Item
                  name="laundryItem"
                  label={tLaundry("IsLaundryItem")}
                  tooltip={tLaundry("IsLaundryItemHint")}
                  valuePropName="checked"
                  layout="horizontal"
                  className="mb-0"
                >
                  <Switch />
                </Form.Item>
              )}
            </div>
          </Col>

          {/* الأرقام التسلسلية والضمان (وحدة serials) */}
          {serialsOn && !isService && (
            <Col xs={24}>
              <h3 className="font-bold mb-3">{tSerial("SectionTitle")}</h3>
              <Row gutter={[16, 0]}>
                <Col xs={24} sm={12} md={6} lg={4}>
                  <Form.Item
                    name="serialCount"
                    label={tSerial("TrackSerial")}
                    tooltip={tSerial("TrackSerialHint")}
                  >
                    <Select
                      options={[0, 1, 2].map((v) => ({
                        value: v,
                        label: tSerial(`Count${v}`),
                      }))}
                    />
                  </Form.Item>
                </Col>
                {serialCount >= 1 && (
                  <Col xs={24} sm={12} md={6} lg={4}>
                    <Form.Item
                      name="serialLabel1"
                      label={tSerial("Label1")}
                      rules={[{ max: 40, message: tAlerts("TextTooLong") }]}
                    >
                      <Input placeholder={tSerial("Label1Placeholder")} />
                    </Form.Item>
                  </Col>
                )}
                {serialCount === 2 && (
                  <Col xs={24} sm={12} md={6} lg={4}>
                    <Form.Item
                      name="serialLabel2"
                      label={tSerial("Label2")}
                      rules={[{ max: 40, message: tAlerts("TextTooLong") }]}
                    >
                      <Input placeholder={tSerial("Label2Placeholder")} />
                    </Form.Item>
                  </Col>
                )}
                <Col xs={12} sm={12} md={6} lg={4}>
                  <Form.Item
                    name="warrantyMonths"
                    label={tSerial("WarrantyMonths")}
                    tooltip={tSerial("WarrantyMonthsHint")}
                  >
                    <InputNumber
                      min={0}
                      max={600}
                      precision={0}
                      style={numberStyle}
                    />
                  </Form.Item>
                </Col>
                {warrantyMonths > 0 && (
                  <Col xs={12} sm={12} md={6} lg={4}>
                    <Form.Item
                      name="warrantyType"
                      label={tSerial("WarrantyType")}
                    >
                      <Select
                        options={["agent", "store"].map((v) => ({
                          value: v,
                          label: tSerial(`WarrantyType_${v}`),
                        }))}
                      />
                    </Form.Item>
                  </Col>
                )}
              </Row>
            </Col>
          )}

          {/* المتابعة الدورية (وحدة followUps): الصنف عليه متابعة كل كام يوم */}
          {followUpsOn && !isService && (
            <Col xs={24}>
              <h3 className="font-bold mb-3">{tForm("FollowUpSection")}</h3>
              <Row gutter={[16, 0]} align="middle">
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item
                    label={tForm("HasFollowUp")}
                    tooltip={tForm("HasFollowUpHint")}
                  >
                    <Switch
                      checked={followUpDays > 0}
                      onChange={(on) =>
                        form.setFieldValue("followUpDays", on ? 90 : 0)
                      }
                    />
                  </Form.Item>
                </Col>
                {followUpDays > 0 && (
                  <Col xs={24} sm={12} md={8} lg={6}>
                    <Form.Item
                      name="followUpDays"
                      label={tForm("FollowUpDays")}
                      extra={tForm("FollowUpDaysHint")}
                      rules={[
                        { required: true, message: tAlerts("RequiredField") },
                      ]}
                    >
                      <InputNumber
                        min={1}
                        max={3650}
                        precision={0}
                        suffix={tForm("Days")}
                        style={numberStyle}
                      />
                    </Form.Item>
                  </Col>
                )}
                {/* الحقل موجود دايمًا (حتى لو مخفي) عشان القيمة 0 تتبعت */}
                {!(followUpDays > 0) && (
                  <Form.Item name="followUpDays" hidden>
                    <InputNumber />
                  </Form.Item>
                )}
              </Row>
            </Col>
          )}

          {/* مدة الخدمة (وحدة bookings): الحجز بيحسب منها ميعاد الانتهاء */}
          {bookingsOn && isService && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <Form.Item
                name="durationMin"
                label={tForm("DurationMin")}
                extra={tForm("DurationMinHint")}
              >
                <InputNumber
                  min={0}
                  max={1440}
                  precision={0}
                  step={5}
                  suffix={tForm("Minutes")}
                  style={numberStyle}
                />
              </Form.Item>
            </Col>
          )}

          {/* المغسلة (وحدة laundry): قطعة مغسلة وأسعار خدماتها (للخدمة بس) */}
          {laundryOn && (
            <LaundryProductFields
              form={form}
              isEdit={isEdit}
              productId={product?.id}
              reloadKey={productKey}
            />
          )}

          {/* التغيير الدوري للسيارات (وحدة vehicles): زيت، فلتر... (صنف أو خدمة) */}
          {vehiclesOn && (
            <Col xs={24}>
              <h3 className="font-bold mb-3">{tForm("ChangeSection")}</h3>
              <Row gutter={[16, 0]} align="middle">
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item
                    label={tForm("HasChange")}
                    tooltip={tForm("HasChangeHint")}
                  >
                    <Switch
                      checked={hasChange}
                      onChange={(on) =>
                        form.setFieldsValue(
                          on
                            ? { changeKm: 5000, changeMonths: 3 }
                            : { changeKm: 0, changeMonths: 0 },
                        )
                      }
                    />
                  </Form.Item>
                </Col>
                {/* الحقول موجودة دايمًا (حتى لو مخفية) عشان القيمة 0 تتبعت */}
                <Col
                  xs={24}
                  sm={12}
                  md={8}
                  lg={6}
                  style={hasChange ? undefined : { display: "none" }}
                >
                  <Form.Item
                    name="changeKm"
                    label={tForm("ChangeKm")}
                    extra={tForm("ChangeKmHint")}
                  >
                    <InputNumber
                      min={0}
                      max={1000000}
                      precision={0}
                      step={1000}
                      suffix={tForm("Km")}
                      style={numberStyle}
                    />
                  </Form.Item>
                </Col>
                <Col
                  xs={24}
                  sm={12}
                  md={8}
                  lg={6}
                  style={hasChange ? undefined : { display: "none" }}
                >
                  <Form.Item
                    name="changeMonths"
                    label={tForm("ChangeMonths")}
                    extra={tForm("ChangeMonthsHint")}
                  >
                    <InputNumber
                      min={0}
                      max={120}
                      precision={0}
                      suffix={tForm("Months")}
                      style={numberStyle}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Col>
          )}

          {/* الوحدات الإضافية (علبة، كرتونة ...) - الخدمة مالهاش */}
          {!isService && (
            <Col xs={24}>
              <h3 className="font-bold mb-3">
                {tHeadings("MoreUnitsHeading")}
              </h3>
              <AdditionalUnitsForm form={form} units={units} />
              <OpeningSummary form={form} units={units} nameOf={nameOf} />
            </Col>
          )}

          {/* المقاسات والألوان (وحدة variants): الإضافة بس */}
          {variantsOn && !isEdit && !isService && (
            <Col xs={24}>
              <h3 className="font-bold mb-1">{tVariants("Title")}</h3>
              <div className="mb-3" style={{ color: C.muted, fontSize: 13 }}>
                {tVariants("FormHint")}
              </div>
              <VariantsFields value={vf} onChange={setVf} />
            </Col>
          )}
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
              backgroundColor: C.navy,
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
            <>
              <Button
                variant="solid"
                color="danger"
                size="large"
                onClick={() => {
                  form.resetFields();
                  setVf(EMPTY_VARIANTS);
                }}
                style={{ height: 50, width: 150, fontSize: 20 }}
              >
                {tButtons("Reset")}
              </Button>
              {/* الرجوع لقائمة الأصناف (بعد ما يخلص إضافة) */}
              <Button
                size="large"
                onClick={() => {
                  form.resetFields();
                  router.push("/products");
                }}
                style={{ height: 50, width: 150, fontSize: 20 }}
              >
                {tButtons("Close")}
              </Button>
            </>
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
        background: C.successSoft,
        border: `1px solid ${C.successBorder}`,
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
