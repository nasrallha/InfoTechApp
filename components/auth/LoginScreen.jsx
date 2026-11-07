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
  BankOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import {
  clearCompanyAction,
  loginAction,
  setupAction,
} from "@/actions/auth.actions";
import { applyFieldErrors } from "@/lib/form-errors";
import { noAutofill } from "./noAutofill";
import PoweredBy from "@/components/support/PoweredBy";
import ContactButtons from "@/components/support/ContactButtons";
import "./login.css";

// شاشة الدخول (تصميم مستقل عن لوحة التحكم)
// needsSetup: لا يوجد أي مستخدم بعد ← نعرض فورم إنشاء مدير النظام بدل الدخول
// currencies: العملات المتاحة لاختيار العملة الأساسية (في الإعداد الأول فقط)
// وضع الشركات (multi):
//   company: اسم الشركة وصورة نشاطها (الجهاز عارف الشركة) | null: يكتب كود الشركة
//   blocked: حالة الاشتراك لو الدخول مقفول (expired / suspended ...)
export default function LoginScreen({
  needsSetup,
  currencies = [],
  multi = false,
  company = null,
  blocked = null,
  blockedReason = null,
  panelUnavailable = false,
  vendor = null,
}) {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const companyName = company
    ? locale === "ar"
      ? company.arName
      : company.enName
    : null;

  return (
    <div className="login-page">
      {/* لوحة التعريف بالنظام (تختفي في الشاشات الصغيرة) */}
      <aside
        className="login-brand"
        style={
          company?.image
            ? {
                // صورة نشاط الشركة (من لوحة التحكم) تحت لون البرنامج
                backgroundImage: `linear-gradient(rgba(0, 70, 72, 0.82), rgba(0, 50, 52, 0.9)), url("${company.image}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className="login-brand__glow login-brand__glow--one" />
        <div className="login-brand__glow login-brand__glow--two" />

        <div className="login-brand__content">
          <div className="login-logo">
            <ShopOutlined />
          </div>
          <h1 className="login-brand__title">{companyName ?? t("AppName")}</h1>
          <p className="login-brand__tagline">
            {companyName ? t("AppName") : t("Tagline")}
          </p>

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

          {needsSetup ? (
            <SetupForm currencies={currencies} />
          ) : (
            <LoginForm
              multi={multi}
              company={company}
              companyName={companyName}
              blocked={blocked}
              blockedReason={blockedReason}
              panelUnavailable={panelUnavailable}
              vendor={vendor}
            />
          )}
        </div>

        <p className="login-panel__secure">
          <SafetyCertificateOutlined /> {t("SecureNote")}
        </p>
        {/* تنفيذ: تكنولوجيا المعلومات */}
        <PoweredBy vendor={vendor} variant="login" />
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
function LoginForm({
  multi,
  company,
  companyName,
  blocked,
  blockedReason,
  panelUnavailable,
  vendor,
}) {
  const [form] = Form.useForm();
  const router = useRouter();
  const t = useTranslations("Auth");
  const tAlerts = useTranslations("Alerts");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [switching, setSwitching] = useState(false);
  const [capsLock, onKey] = useCapsLock();
  // جاي من خروج تلقائي (عدم نشاط) أو جلسة اتقفلت
  const params = useSearchParams();
  const reason = params.get("reason");
  const notice =
    ["idle", "expired"].includes(reason) && !error
      ? t(`reason.${reason}`)
      : null;
  // لينك شركة غلط (/c/...) أو اللوحة مش بترد
  const companyParam = params.get("company");
  const companyNotice =
    !company && !error
      ? panelUnavailable || companyParam === "unavailable"
        ? tAlerts("CompanyUnavailable")
        : companyParam === "notfound"
          ? tAlerts("CompanyNotFound")
          : null
      : null;
  // الشركة محتاجة كود (الجهاز لسه مش عارفها)
  const askCode = multi && !company;

  // "شركة تانية؟": ينسى الشركة ويرجع لخانة الكود
  const switchCompany = async () => {
    setSwitching(true);
    await clearCompanyAction();
    setSwitching(false);
    router.replace("/login");
    router.refresh();
  };

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
    router.refresh();
  };

  return (
    <>
      <h2 className="login-card__title">{t("WelcomeBack")}</h2>
      <p className="login-card__subtitle">{t("LoginSubtitle")}</p>

      {company && (
        <div className="login-company">
          <BankOutlined />
          <span className="login-company__name">{companyName}</span>
          <button
            type="button"
            className="login-company__switch"
            onClick={switchCompany}
            disabled={switching}
          >
            {t("OtherCompany")}
          </button>
        </div>
      )}

      {blocked && !error && (
        <Alert
          type="error"
          showIcon
          title={tAlerts(`Subscription_${blocked}`)}
          description={
            blockedReason || vendor ? (
              <>
                {blockedReason && <div className="mb-2">{blockedReason}</div>}
                <ContactButtons vendor={vendor} size="small" />
              </>
            ) : undefined
          }
          className="mb-5"
        />
      )}
      {error && <Alert type="error" showIcon title={error} className="mb-5" />}
      {notice && <Alert type="info" showIcon title={notice} className="mb-5" />}
      {companyNotice && (
        <Alert type="warning" showIcon title={companyNotice} className="mb-5" />
      )}

      <Form
        form={form}
        layout="vertical"
        size="large"
        onFinish={onFinish}
        requiredMark={false}
        autoComplete="off"
      >
        {askCode && (
          <Form.Item
            name="companyCode"
            label={t("CompanyCode")}
            normalize={(v) => v?.toUpperCase().replace(/\s/g, "")}
            rules={[
              {
                required: true,
                whitespace: true,
                message: tAlerts("RequiredField"),
              },
            ]}
          >
            <Input
              autoComplete="off"
              prefix={<BankOutlined className="login-input-icon" />}
              placeholder={t("CompanyCodePlaceholder")}
              {...noAutofill}
              autoFocus
              dir="ltr"
              maxLength={16}
              style={{ letterSpacing: 2 }}
            />
          </Form.Item>
        )}

        <Form.Item
          name="username"
          label={t("Username")}
          rules={[
            {
              required: true,
              whitespace: true,
              message: tAlerts("RequiredField"),
            },
          ]}
        >
          <Input
            autoComplete="off"
            prefix={<UserOutlined className="login-input-icon" />}
            placeholder={t("UsernamePlaceholder")}
            {...noAutofill}
            autoFocus={!askCode}
            dir="ltr"
          />
        </Form.Item>

        <Form.Item
          name="password"
          label={t("Password")}
          rules={[{ required: true, message: tAlerts("RequiredField") }]}
          extra={
            capsLock ? (
              <span className="login-caps">{t("CapsLockOn")}</span>
            ) : null
          }
        >
          <Input.Password
            autoComplete="new-password"
            prefix={<LockOutlined className="login-input-icon" />}
            placeholder="••••••••"
            {...noAutofill}
            onKeyUp={onKey}
            onKeyDown={onKey}
            dir="ltr"
          />
        </Form.Item>

        <Button
          type="primary"
          htmlType="submit"
          block
          loading={loading}
          className="login-submit"
        >
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
          <Form.Item
            name="arFullname"
            label={tForm("ArFullname")}
            rules={nameRules}
          >
            <Input
              autoComplete="off"
              prefix={<IdcardOutlined className="login-input-icon" />}
            />
          </Form.Item>
          <Form.Item
            name="enFullname"
            label={tForm("EnFullname")}
            rules={nameRules}
          >
            <Input
              autoComplete="off"
              prefix={<IdcardOutlined className="login-input-icon" />}
              dir="ltr"
            />
          </Form.Item>
        </div>

        <Form.Item
          name="username"
          label={t("Username")}
          rules={[
            {
              required: true,
              whitespace: true,
              message: tAlerts("RequiredField"),
            },
            { min: 3, message: tAlerts("UsernameMin") },
            {
              pattern: /^[a-zA-Z0-9._-]+$/,
              message: tAlerts("UsernameInvalid"),
            },
          ]}
        >
          <Input
            autoComplete="off"
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
              autoComplete="new-password"
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
              autoComplete="new-password"
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
