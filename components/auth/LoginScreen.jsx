"use client";

import { useState } from "react";
import { Alert, Button, Form, Input, Select } from "antd";
import {
  UserOutlined,
  LockOutlined,
  IdcardOutlined,
  ShoppingCartOutlined,
  ShopOutlined,
  BarChartOutlined,
  SafetyCertificateOutlined,
  DollarOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { loginAction, setupAction } from "@/actions/auth.actions";
import { applyFieldErrors } from "@/lib/form-errors";
import { noAutofill } from "./noAutofill";
import "./login.css";

// شاشة الدخول (تصميم مستقل عن لوحة التحكم)
// needsSetup: لا يوجد أي مستخدم بعد ← نعرض فورم إنشاء مدير النظام بدل الدخول
// currencies: العملات المتاحة لاختيار العملة الأساسية (في الإعداد الأول فقط)
export default function LoginScreen({ needsSetup, currencies = [] }) {
  const t = useTranslations("Auth");

  return (
    <div className="login-page">
      {/* لوحة التعريف بالنظام (تختفي في الشاشات الصغيرة) */}
      <aside className="login-brand">
        <div className="login-brand__glow login-brand__glow--one" />
        <div className="login-brand__glow login-brand__glow--two" />

        <div className="login-brand__content">
          <div className="login-logo">
            <ShopOutlined />
          </div>
          <h1 className="login-brand__title">{t("AppName")}</h1>
          <p className="login-brand__tagline">{t("Tagline")}</p>

          <ul className="login-features">
            <Feature
              icon={<ShoppingCartOutlined />}
              title={t("FeatureSales")}
              text={t("FeatureSalesText")}
            />
            <Feature
              icon={<ShopOutlined />}
              title={t("FeatureBranches")}
              text={t("FeatureBranchesText")}
            />
            <Feature
              icon={<BarChartOutlined />}
              title={t("FeatureReports")}
              text={t("FeatureReportsText")}
            />
          </ul>
        </div>

        <p className="login-brand__footer">
          © {new Date().getFullYear()} {t("AppName")}
        </p>
      </aside>

      {/* الفورم */}
      <main className="login-panel">
        <div className="login-panel__top">
          <LanguageToggle />
        </div>

        <div className="login-card">
          {/* الشعار يظهر هنا في الموبايل فقط */}
          <div className="login-logo login-logo--mobile">
            <ShopOutlined />
          </div>

          {needsSetup ? <SetupForm currencies={currencies} /> : <LoginForm />}
        </div>

        <p className="login-panel__secure">
          <SafetyCertificateOutlined /> {t("SecureNote")}
        </p>
      </main>
    </div>
  );
}

function Feature({ icon, title, text }) {
  return (
    <li className="login-feature">
      <span className="login-feature__icon">{icon}</span>
      <div>
        <div className="login-feature__title">{title}</div>
        <div className="login-feature__text">{text}</div>
      </div>
    </li>
  );
}

// زر تغيير اللغة (عربي / English)
function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const next = locale === "ar" ? "en" : "ar";

  return (
    <button
      type="button"
      className="login-lang"
      onClick={() => router.replace(pathname, { locale: next })}
    >
      {next === "ar" ? "العربية" : "English"}
    </button>
  );
}

// تنبيه Caps Lock (سبب شائع لفشل الدخول)
function useCapsLock() {
  const [on, setOn] = useState(false);
  const onKey = (e) => setOn(e.getModifierState?.("CapsLock") ?? false);
  return [on, onKey];
}

// ------------------------------------------------------------
// تسجيل الدخول
// ------------------------------------------------------------
function LoginForm() {
  const [form] = Form.useForm();
  const router = useRouter();
  const t = useTranslations("Auth");
  const tAlerts = useTranslations("Alerts");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [capsLock, onKey] = useCapsLock();
  // جاي من خروج تلقائي (عدم نشاط) أو جلسة اتقفلت
  const reason = useSearchParams().get("reason");
  const notice = ["idle", "expired"].includes(reason) && !error ? t(`reason.${reason}`) : null;

  const onFinish = async (values) => {
    setLoading(true);
    setError(null);
    const res = await loginAction(values);

    if (!res.success) {
      setLoading(false);
      // التفاصيل: الدقايق المتبقية للقفل / المحاولات المتبقية
      setError(tAlerts(res.error, res.details ?? undefined));
      form.setFieldValue("password", "");
      return;
    }

    // نجاح: نبقي زر التحميل حتى تفتح الصفحة الرئيسية
    router.replace("/");
  };

  return (
    <>
      <h2 className="login-card__title">{t("WelcomeBack")}</h2>
      <p className="login-card__subtitle">{t("LoginSubtitle")}</p>

      {error && <Alert type="error" showIcon title={error} className="mb-5" />}
      {notice && <Alert type="info" showIcon title={notice} className="mb-5" />}

      <Form
        form={form}
        layout="vertical"
        size="large"
        onFinish={onFinish}
        requiredMark={false}
        autoComplete="off"
      >
        <Form.Item
          name="username"
          label={t("Username")}
          rules={[{ required: true, whitespace: true, message: tAlerts("RequiredField") }]}
        >
          <Input
            prefix={<UserOutlined className="login-input-icon" />}
            placeholder={t("UsernamePlaceholder")}
            {...noAutofill}
            autoFocus
            dir="ltr"
          />
        </Form.Item>

        <Form.Item
          name="password"
          label={t("Password")}
          rules={[{ required: true, message: tAlerts("RequiredField") }]}
          extra={capsLock ? <span className="login-caps">{t("CapsLockOn")}</span> : null}
        >
          <Input.Password
            prefix={<LockOutlined className="login-input-icon" />}
            placeholder="••••••••"
            {...noAutofill}
            onKeyUp={onKey}
            onKeyDown={onKey}
            dir="ltr"
          />
        </Form.Item>

        <Button type="primary" htmlType="submit" block loading={loading} className="login-submit">
          {t("Login")}
        </Button>
      </Form>
    </>
  );
}

// ------------------------------------------------------------
// إعداد النظام لأول مرة (إنشاء مدير النظام)
// ------------------------------------------------------------
function SetupForm({ currencies }) {
  const [form] = Form.useForm();
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("Auth");
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const onFinish = async (formValues) => {
    // تأكيد كلمة المرور للواجهة فقط، لا نرسله للسيرفر
    const values = { ...formValues };
    delete values.confirmPassword;

    setLoading(true);
    setError(null);
    const res = await setupAction(values);

    if (!res.success) {
      setLoading(false);
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      setError(tAlerts(res.error));
      return;
    }

    router.replace("/");
  };

  const nameRules = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
    { min: 3, message: tAlerts("MinCharcters") },
    { max: 100, message: tAlerts("TextTooLong") },
  ];

  return (
    <>
      <h2 className="login-card__title">{t("SetupTitle")}</h2>
      <p className="login-card__subtitle">{t("SetupSubtitle")}</p>

      {error && <Alert type="error" showIcon title={error} className="mb-5" />}

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        requiredMark={false}
        autoComplete="off"
        initialValues={{ currencyId: currencies.find((c) => c.isBase)?.id }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
          <Form.Item name="arFullname" label={tForm("ArFullname")} rules={nameRules}>
            <Input prefix={<IdcardOutlined className="login-input-icon" />} />
          </Form.Item>
          <Form.Item name="enFullname" label={tForm("EnFullname")} rules={nameRules}>
            <Input prefix={<IdcardOutlined className="login-input-icon" />} dir="ltr" />
          </Form.Item>
        </div>

        <Form.Item
          name="username"
          label={t("Username")}
          rules={[
            { required: true, whitespace: true, message: tAlerts("RequiredField") },
            { min: 3, message: tAlerts("UsernameMin") },
            { pattern: /^[a-zA-Z0-9._-]+$/, message: tAlerts("UsernameInvalid") },
          ]}
        >
          <Input
            prefix={<UserOutlined className="login-input-icon" />}
            {...noAutofill}
            dir="ltr"
          />
        </Form.Item>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
          <Form.Item
            name="password"
            label={t("Password")}
            rules={[
              { required: true, message: tAlerts("RequiredField") },
              { min: 6, message: tAlerts("PasswordMin") },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className="login-input-icon" />}
              {...noAutofill}
              dir="ltr"
            />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={t("ConfirmPassword")}
            dependencies={["password"]}
            rules={[
              { required: true, message: tAlerts("RequiredField") },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || getFieldValue("password") === value
                    ? Promise.resolve()
                    : Promise.reject(new Error(tAlerts("PasswordsNotMatch"))),
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className="login-input-icon" />}
              {...noAutofill}
              dir="ltr"
            />
          </Form.Item>
        </div>

        {/* العملة الأساسية للبرنامج (يمكن تغييرها لاحقاً من الإعدادات) */}
        {currencies.length > 0 && (
          <Form.Item
            name="currencyId"
            label={t("BaseCurrency")}
            tooltip={t("BaseCurrencyHint")}
            rules={[{ required: true, message: tAlerts("RequiredField") }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              prefix={<DollarOutlined className="login-input-icon" />}
              options={currencies.map((c) => ({
                value: c.id,
                label: `${locale === "ar" ? c.arName : c.enName} (${c.code})`,
              }))}
            />
          </Form.Item>
        )}

        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          loading={loading}
          className="login-submit"
        >
          {t("CreateAdmin")}
        </Button>
      </Form>
    </>
  );
}
