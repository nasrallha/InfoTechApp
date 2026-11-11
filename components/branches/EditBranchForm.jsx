"use client";

import { useEffect } from "react";
import { Form } from "antd";
import { message } from "@/components/common/feedback";
import { useTranslations } from "next-intl";
import { updateBranchAction } from "@/actions/branch.actions";
import { applyFieldErrors } from "@/lib/form-errors";
import BranchFormFields, {
  branchFormValues,
  branchPayload,
} from "./BranchFormFields";

// branch: الفرع المراد تعديلها (من قاعدة البيانات)
const EditBranchForm = ({
  branch,
  onSuccess,
  setLoading,
  warehouses,
  priceLists,
}) => {
  const [form] = Form.useForm();
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");

  // تعبئة الفورم ببيانات الفرع المختارة
  useEffect(() => {
    if (branch) {
      form.setFieldsValue(branchFormValues(branch));
    }
  }, [branch, form]);

  const onFinish = async (values) => {
    setLoading?.(true);
    const res = await updateBranchAction({
      id: branch.id,
      ...branchPayload(values),
    });
    setLoading?.(false);

    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts("BranchUpdated"));
    onSuccess?.();
  };

  return (
    <Form
      form={form}
      id="EditBranchForm"
      autoComplete="off"
      onFinish={onFinish}
      layout="vertical"
      style={{ padding: "10px 10px 0 10px" }}
    >
      <BranchFormFields
        tForm={tForm}
        tAlerts={tAlerts}
        warehouses={warehouses}
        priceLists={priceLists}
        codeLocked={Boolean(branch?.codeLocked)}
      />
    </Form>
  );
};

export default EditBranchForm;
