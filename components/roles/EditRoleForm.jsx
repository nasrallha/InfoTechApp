"use client";

import { useEffect } from "react";
import { Form } from "antd";
import { message } from "@/components/common/feedback";
import { useTranslations } from "next-intl";
import { updateRoleAction } from "@/actions/role.actions";
import { applyFieldErrors } from "@/lib/form-errors";
import RoleFormFields from "./RoleFormFields";

// role: الدور المراد تعديلها (من قاعدة البيانات)
const EditRoleForm = ({ role, onSuccess, setLoading }) => {
  const [form] = Form.useForm();
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");

  // تعبئة الفورم ببيانات الدور المختارة
  useEffect(() => {
    if (role) {
      form.setFieldsValue({
        arName: role.arName,
        enName: role.enName,
        isActive: role.isActive,
        isSuper: role.isSuper,
      });
    }
  }, [role, form]);

  const onFinish = async (values) => {
    setLoading?.(true);
    const res = await updateRoleAction({
      id: role.id,
      arName: values.arName,
      enName: values.enName,
      isActive: values.isActive,
      // الحقل يظهر لمدير النظام فقط، غيره نرسل القيمة الحالية كما هي
      isSuper: values.isSuper ?? role.isSuper,
    });
    setLoading?.(false);

    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts("RoleUpdated"));
    onSuccess?.();
  };

  return (
    <Form
      form={form}
      id="EditRoleForm"
      autoComplete="off"
      onFinish={onFinish}
      style={{ padding: "10px 10px 0 10px" }}
    >
      <RoleFormFields tForm={tForm} tAlerts={tAlerts} />
    </Form>
  );
};

export default EditRoleForm;
