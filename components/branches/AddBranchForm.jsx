"use client";

import { Form } from "antd";
import { message } from "@/components/common/feedback";
import { useTranslations } from "next-intl";
import { createBranchAction } from "@/actions/branch.actions";
import { applyFieldErrors } from "@/lib/form-errors";
import BranchFormFields, {
  branchFormValues,
  branchPayload,
} from "./BranchFormFields";

// onSuccess, setLoading: يرسلها FormModal تلقائياً (لإغلاق النافذة وزر التحميل)
const AddBranchForm = ({ onSuccess, setLoading, warehouses, priceLists }) => {
  const [form] = Form.useForm();
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");

  const onFinish = async (values) => {
    setLoading?.(true);
    // لا توجد ملفات، فنرسل كائناً عادياً (الأنواع تصل كما هي)
    const res = await createBranchAction(branchPayload(values));
    setLoading?.(false);

    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts("BranchAdded"));
    form.resetFields();
    onSuccess?.();
  };

  return (
    <Form
      form={form}
      id="AddBranchForm"
      autoComplete="off"
      onFinish={onFinish}
      layout="vertical"
      initialValues={branchFormValues(null)}
      style={{ padding: "10px 10px 0 10px" }}
    >
      <BranchFormFields
        tForm={tForm}
        tAlerts={tAlerts}
        warehouses={warehouses}
        priceLists={priceLists}
      />
    </Form>
  );
};

export default AddBranchForm;
