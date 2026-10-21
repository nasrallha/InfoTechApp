"use client";

import { useEffect } from "react";
import { Input, Form, Select, Switch } from "antd";
import { message } from "@/components/common/feedback";
import { useLocale, useTranslations } from "next-intl";
import ImageUploadItem from "@/components/common/ImageUploadItem";
import { updateCategoryAction } from "@/actions/category.actions";
import { applyFieldErrors } from "@/lib/form-errors";
import { imageUrl } from "@/lib/image";
import "./categoryForm.css";

// category: القسم المراد تعديله (من قاعدة البيانات)
// mainCategories: الأقسام الرئيسية (لقائمة القسم الأب)
const EditCategoryForm = ({
  category,
  mainCategories = [],
  onSuccess,
  setLoading,
}) => {
  const [form] = Form.useForm();
  const locale = useLocale();
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");

  // القسم الذي عنده أقسام فرعية يبقى رئيسياً (الشجرة مستويان فقط)
  const hasChildren = (category?.children?.length ?? 0) > 0;

  // القسم لا يظهر في قائمة الآباء الخاصة به
  const parentOptions = mainCategories
    .filter((c) => c.id !== category?.id)
    .map((c) => ({
      value: c.id,
      label: locale === "ar" ? c.arName : c.enName,
    }));

  // تعبئة الفورم ببيانات القسم المختار
  useEffect(() => {
    if (category) {
      form.setFieldsValue({
        arName: category.arName,
        enName: category.enName,
        parentId: category.parentId,
        isActive: category.isActive,
        // الصورة الحالية (لو موجودة) تظهر في القائمة برابطها
        image: category.image
          ? [
              {
                uid: "-1",
                name: category.image.split("/").pop(),
                status: "done",
                url: imageUrl(category.image),
              },
            ]
          : [],
      });
    } else {
      form.resetFields();
    }
  }, [category, form]);

  const onFinish = async (values) => {
    const formData = new FormData();
    formData.append("id", category.id);
    formData.append("arName", values.arName);
    formData.append("enName", values.enName);
    if (values.parentId) formData.append("parentId", values.parentId);
    formData.append("isActive", String(values.isActive));

    // الصورة: 3 حالات
    const fileList = values.image ?? [];
    const newFile = fileList[0]?.originFileObj;

    if (newFile) {
      // 1) اختار صورة جديدة
      formData.append("image", newFile);
    } else if (category.image && fileList.length === 0) {
      // 2) شال الصورة الحالية ولم يختر غيرها
      formData.append("removeImage", "true");
    }
    // 3) غير ذلك: الصورة كما هي

    setLoading?.(true);
    const res = await updateCategoryAction(formData);
    setLoading?.(false);

    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts("CategoryUpdated"));
    onSuccess?.();
  };

  return (
    <Form
      form={form}
      id="EditCategoryForm"
      autoComplete="off"
      onFinish={onFinish}
      style={{
        padding: "10px 10px 0 10px",
        width: "100%",
      }}
    >
      <Form.Item
        label={tForm("ArName")}
        name="arName"
        hasFeedback
        rules={[
          { required: true, whitespace: true, message: tAlerts("RequiredField") },
          { min: 3, message: tAlerts("MinCharcters") },
          { max: 50, message: tAlerts("MaxCharacters") },
        ]}
      >
        <Input />
      </Form.Item>

      <Form.Item
        label={tForm("EnName")}
        name="enName"
        hasFeedback
        rules={[
          { required: true, whitespace: true, message: tAlerts("RequiredField") },
          { min: 3, message: tAlerts("MinCharcters") },
          { max: 50, message: tAlerts("MaxCharacters") },
        ]}
      >
        <Input />
      </Form.Item>

      <Form.Item label={tForm("MainCategory")} name="parentId">
        <Select
          showSearch
          allowClear
          optionFilterProp="label"
          options={parentOptions}
          disabled={hasChildren}
        />
      </Form.Item>

      {/* الصورة اختيارية: تقدر تغيّرها أو تشيلها */}
      <ImageUploadItem name="image" label={tForm("Image")} />

      <Form.Item name="isActive" label={tForm("Active")} valuePropName="checked">
        <Switch />
      </Form.Item>
    </Form>
  );
};

export default EditCategoryForm;
