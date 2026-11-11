"use client";

import { useEffect } from "react";
import { Form, Input, Select, Switch, Row, Col } from "antd";
import { message } from "@/components/common/feedback";
import { CrownFilled, LockOutlined, UserOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { createUserAction, updateUserAction } from "@/actions/user.actions";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { applyFieldErrors } from "@/lib/form-errors";
import { imageUrl } from "@/lib/image";
import ImageUploadItem from "@/components/common/ImageUploadItem";
import { C } from "@/lib/theme";

// فورم المستخدم (نفس الفورم للإضافة والتعديل)
// user: بيانات المستخدم في التعديل (أو null في الإضافة)
// roles, branches: لقوائم الاختيار
// onSuccess, setLoading: يرسلها FormModal تلقائياً
const UserForm = ({ formId, user = null, roles, branches, onSuccess, setLoading }) => {
  const [form] = Form.useForm();
  const isEdit = Boolean(user);
  const currentUser = useCurrentUser();
  const isSelf = isEdit && user.id === currentUser?.id;

  const locale = useLocale();
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");
  const tAuth = useTranslations("Auth");

  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);

  // تعبئة الفورم في وضع التعديل
  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        arFullname: user.arFullname,
        enFullname: user.enFullname,
        username: user.username,
        roleId: user.role.id,
        branchId: user.branch.id,
        isActive: user.isActive,
        // الصورة الحالية (لو موجودة) تظهر في القائمة برابطها
        image: user.image
          ? [
              {
                uid: "-1",
                name: user.image.split("/").pop(),
                status: "done",
                url: imageUrl(user.image),
              },
            ]
          : [],
      });
    }
  }, [user, form]);

  const onFinish = async (values) => {
    // getFieldsValue(true): كل القيم حتى الحقول المقفولة (مثل الفرع لغير مدير النظام)
    const all = { ...form.getFieldsValue(true), ...values };

    // FormData لأن فيها صورة (تأكيد كلمة المرور للواجهة فقط فلا نرسله)
    const formData = new FormData();
    if (isEdit) formData.append("id", user.id);
    formData.append("arFullname", all.arFullname ?? "");
    formData.append("enFullname", all.enFullname ?? "");
    formData.append("username", all.username ?? "");
    formData.append("password", all.password ?? "");
    if (all.roleId) formData.append("roleId", all.roleId);
    if (all.branchId) formData.append("branchId", all.branchId);
    formData.append("isActive", String(all.isActive ?? true));

    // الصورة: 3 حالات
    const fileList = all.image ?? [];
    const newFile = fileList[0]?.originFileObj;
    if (newFile) {
      // 1) اختار صورة جديدة
      formData.append("image", newFile);
    } else if (isEdit && user.image && fileList.length === 0) {
      // 2) شال الصورة الحالية ولم يختر غيرها
      formData.append("removeImage", "true");
    }
    // 3) غير ذلك: الصورة كما هي (أو بدون صورة)

    setLoading?.(true);
    const res = isEdit ? await updateUserAction(formData) : await createUserAction(formData);
    setLoading?.(false);

    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts(isEdit ? "UserUpdated" : "UserAdded"));
    if (!isEdit) form.resetFields();
    onSuccess?.();
  };

  const nameRules = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
    { min: 3, message: tAlerts("MinCharcters") },
    { max: 100, message: tAlerts("TextTooLong") },
  ];

  // في التعديل كلمة المرور اختيارية (فارغة = لا تتغير)
  const passwordRules = [
    ...(isEdit ? [] : [{ required: true, message: tAlerts("RequiredField") }]),
    { min: 6, message: tAlerts("PasswordMin") },
    { max: 100, message: tAlerts("TextTooLong") },
  ];

  // الدور الحالي للمستخدم قد يكون غير نشط (لا يظهر في القائمة): نضيفه حتى يظهر اسمه
  const roleOptions = [...roles];
  if (isEdit && !roles.some((r) => r.id === user.role.id)) roleOptions.push(user.role);

  const branchOptions = [...branches];
  if (isEdit && !branches.some((b) => b.id === user.branch.id)) branchOptions.push(user.branch);

  return (
    <Form
      form={form}
      id={formId}
      layout="vertical"
      autoComplete="off"
      className="compact-modal-form"
      onFinish={onFinish}
      initialValues={{
        isActive: true,
        // غير مدير النظام: الفرع ثابت على فرعه الحالي
        branchId: branches.length === 1 ? branches[0].id : undefined,
      }}
      style={{ padding: "10px 10px 0 10px" }}
    >
      {/* البيانات الأساسية */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={8}>
          <Form.Item name="arFullname" label={tForm("ArFullname")} rules={nameRules} hasFeedback>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="enFullname" label={tForm("EnFullname")} rules={nameRules} hasFeedback>
            <Input dir="ltr" />
          </Form.Item>
        </Col>

        <Col xs={24} md={8}>
          <Form.Item
            name="username"
            label={tAuth("Username")}
            tooltip={tForm("UsernameHint")}
            rules={[
              { required: true, whitespace: true, message: tAlerts("RequiredField") },
              { min: 3, message: tAlerts("UsernameMin") },
              { max: 50, message: tAlerts("TextTooLong") },
              { pattern: /^[a-zA-Z0-9._-]+$/, message: tAlerts("UsernameInvalid") },
            ]}
            normalize={(v) => v?.toLowerCase()}
          >
            <Input prefix={<UserOutlined />} dir="ltr" autoComplete="off" />
          </Form.Item>
        </Col>

        {/* الدور والفرع والحالة */}
        <Col xs={24} md={8}>
          <Form.Item
            name="roleId"
            label={tForm("Role")}
            rules={[{ required: true, message: tAlerts("RequiredField") }]}
          >
            <Select
              disabled={isSelf}
              placeholder={tForm("SelectRole")}
              showSearch={{ optionFilterProp: "label" }}
              options={roleOptions.map((r) => ({
                value: r.id,
                label: nameOf(r),
                isSuper: r.isSuper,
              }))}
              optionRender={(option) => (
                <span>
                  {option.data.isSuper && (
                    <CrownFilled style={{ color: C.warning, marginInlineEnd: 6 }} />
                  )}
                  {option.data.label}
                </span>
              )}
            />
          </Form.Item>
        </Col>
        <Col xs={16} md={8}>
          <Form.Item
            name="branchId"
            label={tForm("Branch")}
            tooltip={tForm("BranchHint")}
            rules={[{ required: true, message: tAlerts("RequiredField") }]}
          >
            <Select
              disabled={!currentUser?.isSuper}
              placeholder={tForm("SelectBranch")}
              showSearch={{ optionFilterProp: "label" }}
              options={branchOptions.map((b) => ({ value: b.id, label: nameOf(b) }))}
            />
          </Form.Item>
        </Col>
        <Col xs={8} md={8}>
          <Form.Item name="isActive" label={tForm("Active")} valuePropName="checked">
            <Switch disabled={isSelf} />
          </Form.Item>
        </Col>

        {/* كلمة المرور (في التعديل: فاضية = مبتتغيرش ← تلميح) */}
        <Col xs={24} md={8}>
          <Form.Item
            name="password"
            label={tAuth("Password")}
            tooltip={isEdit ? tForm("PasswordKeepHint") : undefined}
            rules={passwordRules}
          >
            <Input.Password prefix={<LockOutlined />} dir="ltr" autoComplete="new-password" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name="confirmPassword"
            label={tAuth("ConfirmPassword")}
            dependencies={["password"]}
            rules={[
              ({ getFieldValue }) => ({
                validator: (_, value) => {
                  const password = getFieldValue("password");
                  if (!password && !value) return Promise.resolve();
                  return password === value
                    ? Promise.resolve()
                    : Promise.reject(new Error(tAlerts("PasswordsNotMatch")));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} dir="ltr" autoComplete="new-password" />
          </Form.Item>
        </Col>

        {/* الصورة (اختيارية): لو موجودة تظهر بدل الأفاتار */}
        <Col xs={24} md={8}>
          <ImageUploadItem name="image" label={tForm("UserImage")} />
        </Col>
      </Row>
    </Form>
  );
};

export default UserForm;
