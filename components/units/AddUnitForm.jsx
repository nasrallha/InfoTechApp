"use client";

import { Form } from "antd";
import { message } from "@/components/common/feedback";
import { useTranslations } from "next-intl";
import { createUnitAction } from "@/actions/unit.actions";
import { applyFieldErrors } from "@/lib/form-errors";
import UnitFormFields from "./UnitFormFields";
import "./unitForm.css";

// onSuccess, setLoading: يرسلها FormModal تلقائياً (لإغلاق النافذة وزر التحميل)
const AddUnitForm = ({ onSuccess, setLoading }) => {
  const [form] = Form.useForm();
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");

  const onFinish = async (values) => {
    setLoading?.(true);
    // لا توجد ملفات، فنرسل كائناً عادياً (الأنواع تصل كما هي)
    const res = await createUnitAction({
      arName: values.arName,
      enName: values.enName,
      isActive: values.isActive,
    });
    setLoading?.(false);

    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts("UnitAdded"));
    form.resetFields();
    onSuccess?.();
  };

  return (
    <Form
      form={form}
      id="AddUnitForm"
      autoComplete="off"
      onFinish={onFinish}
      initialValues={{ arName: "", enName: "", isActive: true }}
      style={{ padding: "10px 10px 0 10px" }}
    >
      <UnitFormFields tForm={tForm} tAlerts={tAlerts} />
    </Form>
  );
};

export default AddUnitForm;
