"use client";

import { Input, Form, Select, Switch } from "antd";
import { message } from "@/components/common/feedback";
import { useLocale, useTranslations } from "next-intl";
import ImageUploadItem from "@/components/common/ImageUploadItem";
import { createCategoryAction } from "@/actions/category.actions";
import { applyFieldErrors } from "@/lib/form-errors";
import "./categoryForm.css";

// mainCategories: الأقسام الرئيسية (لقائمة القسم الأب)
// onSuccess, setLoading: يرسلها FormModal تلقائياً (لإغلاق النافذة وزر التحميل)
const AddCategoryForm = ({ mainCategories = [], onSuccess, setLoading }) => {
  const [form] = Form.useForm();
  const locale = useLocale();
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");

  const parentOptions = mainCategories.map((c) => ({
    value: c.id,
    label: locale === "ar" ? c.arName : c.enName,
  }));

  // تنطلق فقط بعد نجاح قواعد الفورم (rules)
  const onFinish = async (values) => {
    // FormData لأننا نرسل ملف صورة مع البيانات
    const formData = new FormData();
    formData.append("arName", values.arName);
    formData.append("enName", values.enName);
    if (values.parentId) formData.append("parentId", values.parentId);
    formData.append("isActive", String(values.isActive));

    // الصورة اختيارية: نرسلها فقط لو المستخدم اختار ملفاً
    const file = values.image?.[0]?.originFileObj;
    if (file) formData.append("image", file);

    setLoading?.(true);
    const res = await createCategoryAction(formData);
    setLoading?.(false);

    if (!res.success) {
      // أخطاء الحقول تظهر تحت كل حقل، وباقي الأخطاء كرسالة
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts("CategoryAdded"));
    form.resetFields();
    // بنرجّع القسم الجديد (للإضافة السريعة من شاشة الصنف)
    onSuccess?.(res.data);
  };

  return (
    <Form
      form={form}
      id="AddCategoryForm"
      autoComplete="off"
      onFinish={onFinish}
      initialValues={{
        arName: "",
        enName: "",
        parentId: null,
        image: [],
        isActive: true,
      }}
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

      {/* فاضي = قسم رئيسي */}
      <Form.Item label={tForm("MainCategory")} name="parentId">
        <Select
          showSearch
          allowClear
          optionFilterProp="label"
          options={parentOptions}
        />
      </Form.Item>

      {/* الصورة اختيارية */}
      <ImageUploadItem name="image" label={tForm("Image")} />

      <Form.Item name="isActive" label={tForm("Active")} valuePropName="checked">
        <Switch />
      </Form.Item>
      <hr />
    </Form>
  );
};

export default AddCategoryForm;
