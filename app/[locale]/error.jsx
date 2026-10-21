"use client";

// ============================================================
// صفحة الخطأ العامة (أي خطأ غير متوقع داخل أي صفحة)
// - لو الخطأ من قاعدة البيانات: نفس شاشة "تعذر الاتصال" بخطوات الحل
// - غير ذلك: رسالة واضحة + زر إعادة المحاولة
// ملاحظة: في الإنتاج Next يخفي تفاصيل الخطأ، فنكتب احتمال قاعدة البيانات كتلميح
// ============================================================
import { Button, Result } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { dbErrorKind } from "@/lib/db-errors";
import DbErrorScreen from "@/components/common/DbErrorScreen";

export default function ErrorPage({ error, reset }) {
  const t = useTranslations("DbError");
  const tc = useTranslations("Connection");
  const kind = dbErrorKind(error?.message ?? "");

  // الخطأ سببه الاتصال (النت فاصل أو السيرفر مش بيرد)
  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false;
  const network = /fetch|network|load failed/i.test(error?.message ?? "");
  if (offline || network) {
    const state = offline ? "offline" : "server";
    return (
      <Result
        status="warning"
        title={tc(`${state}.title`)}
        subTitle={tc(`${state}.text`)}
        extra={
          <Button
            type="primary"
            size="large"
            icon={<ReloadOutlined />}
            onClick={() => window.location.reload()}
          >
            {tc("Retry")}
          </Button>
        }
      />
    );
  }

  if (kind) {
    return (
      <DbErrorScreen
        kind={kind}
        details={process.env.NODE_ENV !== "production" ? error?.message : null}
      />
    );
  }

  return (
    <Result
      status="error"
      title={t("GenericTitle")}
      subTitle={t("GenericText")}
      extra={
        <Button
          type="primary"
          size="large"
          icon={<ReloadOutlined />}
          onClick={() => reset?.() ?? window.location.reload()}
        >
          {t("Retry")}
        </Button>
      }
    />
  );
}
