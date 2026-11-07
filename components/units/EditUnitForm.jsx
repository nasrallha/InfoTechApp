"use client";

import { useEffect } from "react";
import { Form } from "antd";
import { message } from "@/components/common/feedback";
import { useTranslations } from "next-intl";
import { updateUnitAction } from "@/actions/unit.actions";
import { applyFieldErrors } from "@/lib/form-errors";
import UnitFormFields from "./UnitFormFields";
import "./unitForm.css";

// unit: الوحدة المراد تعديلها (من قاعدة البيانات)
const EditUnitForm = ({ unit, onSuccess, setLoading }) => {
  const [form] = Form.useForm();
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");

  // تعبئة الفورم ببيانات الوحدة المختارة
  useEffect(() => {
    if (unit) {
      form.setFieldsValue({
        arName: unit.arName,
        enName: unit.enName,
        isActive: unit.isActive,
        allowDecimals: unit.allowDecimals ?? true,
      });
    }
  }, [unit, form]);

  const onFinish = async (values) => {
    setLoading?.(true);
    const res = await updateUnitAction({
      id: unit.id,
      arName: values.arName,
      enName: values.enName,
      isActive: values.isActive,
      allowDecimals: values.allowDecimals,
    });
    setLoading?.(false);

    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts("UnitUpdated"));
    onSuccess?.();
  };

  return (
    <Form
      form={form}
      id="EditUnitForm"
      autoComplete="off"
      onFinish={onFinish}
      style={{ padding: "10px 10px 0 10px" }}
    >
      <UnitFormFields tForm={tForm} tAlerts={tAlerts} />
    </Form>
  );
};

export default EditUnitForm;
