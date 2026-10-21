"use client";

import { Tag } from "antd";
import { message, modal } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";

// ============================================================
// أدوات مشتركة لشاشات الربط مع الزكاة
// ============================================================

export const ENV_COLOR = {
  developer: "blue",
  simulation: "orange",
  production: "green",
};

export const STATUS_COLOR = {
  draft: "default",
  csr: "processing",
  compliance: "gold",
  checked: "cyan",
  active: "success",
};

// ترتيب الخطوات: 0 بيانات، 1 CSR، 2 OTP، 3 فحص، 4 إنتاج، 5 تم
export function stepOf(unit) {
  if (!unit) return 0;
  return (
    { draft: 1, csr: 2, compliance: 3, checked: 4, active: 5 }[unit.status] ?? 0
  );
}

export function EnvTag({ env, t }) {
  if (!env) return null;
  return <Tag color={ENV_COLOR[env]}>{t(`env.${env}`)}</Tag>;
}

export function StatusTag({ unit, t }) {
  if (!unit) return <Tag>{t("status.none")}</Tag>;
  return (
    <Tag color={STATUS_COLOR[unit.status] ?? "default"}>
      {t(`status.${unit.status}`)}
    </Tag>
  );
}

// رسالة خطأ مفصّلة (رفض الهيئة / بيانات ناقصة / خطأ من الخدمة)
export function showZatcaError(res, { t, tAlerts, locale }) {
  const list = (items) => (
    <ul style={{ margin: "8px 0 0", paddingInlineStart: 18 }}>
      {items.map((m, i) => (
        <li key={i} style={{ marginBottom: 4 }}>
          {m}
        </li>
      ))}
    </ul>
  );

  if (res?.error === "ZatcaRejected") {
    const msgs = (res.details?.messages ?? [])
      .map((m) => [m.code, m.message].filter(Boolean).join(": "))
      .filter(Boolean);
    modal.error({
      title: tAlerts("ZatcaRejected"),
      content: msgs.length ? list(msgs) : null,
      width: 560,
    });
    return;
  }

  if (res?.error === "ZatcaSellerIncomplete") {
    modal.error({
      title: tAlerts("ZatcaSellerIncomplete"),
      content: list((res.details?.missing ?? []).map((k) => t(`missing.${k}`))),
    });
    return;
  }

  if (res?.error === "ZatcaGatewayError") {
    const d = res.details ?? {};
    const inner = Array.isArray(d.details)
      ? d.details.map((e) =>
          typeof e === "object"
            ? [e.field, e.message].filter(Boolean).join(": ")
            : String(e),
        )
      : [];
    modal.error({
      title: tAlerts("ZatcaGatewayError"),
      content: (
        <div>
          {d.message ? <div>{d.message}</div> : null}
          {inner.length ? list(inner) : null}
        </div>
      ),
      width: 560,
    });
    return;
  }

  showActionError(res, tAlerts, locale);
}

export const DOC_STATUS_COLOR = {
  pending: "gold",
  reported: "success",
  cleared: "success",
  rejected: "error",
  error: "orange",
  unsigned: "default",
};

// نتيجة الفاتورة الإلكترونية بعد الحفظ (رسالة للمستخدم)
export function showZatcaResult(z, { t }) {
  if (!z) return;
  const msgs = [...(z.errors ?? [])]
    .map((m) => [m.code, m.message].filter(Boolean).join(": "))
    .filter(Boolean);
  if (z.status === "reported" || z.status === "cleared") {
    message.success(t(`result.${z.status}`));
    if (z.warnings?.length) message.warning(t("result.withWarnings"));
    return;
  }
  if (z.sending) return message.info(t("result.sending"));
  if (
    z.status === "rejected" ||
    (z.kind === "standard" && z.status !== "cleared")
  ) {
    modal.error({
      title:
        z.status === "rejected"
          ? t("result.rejected")
          : t("result.standardNotCleared"),
      content: msgs.length ? (
        <ul style={{ margin: "8px 0 0", paddingInlineStart: 18 }}>
          {msgs.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      ) : null,
      width: 560,
    });
    return;
  }
  message.warning(t(`result.${z.status}`));
}
