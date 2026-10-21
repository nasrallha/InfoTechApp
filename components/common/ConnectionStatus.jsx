"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Result } from "antd";
import {
  CloudServerOutlined,
  DatabaseOutlined,
  DisconnectOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";

// ============================================================
// شاشة واضحة لما الاتصال يقع (في كل صفحات البرنامج)
// - مفيش إنترنت عند المستخدم        ← "مفيش اتصال بالإنترنت"
// - إنترنت شغال بس السيرفر مش بيرد   ← "مشكلة في السيرفر"
// - السيرفر شغال وقاعدة البيانات واقفة ← "مشكلة في قاعدة البيانات"
// الشاشة بتغطي البرنامج من غير ما تمسح اللي على الشاشة (الفاتورة اللي بتتعمل
// بتفضل زي ما هي)، وبتختفي لوحدها أول ما الاتصال يرجع
// الفحص: /api/health كل دقيقة، وبسرعة أكبر وقت المشكلة، ولما الشاشة ترجع للواجهة
// + تسجيل Service Worker بيعرض صفحة offline.html لو حد فتح الموقع والنت فاصل
// ============================================================
const CHECK_OK_MS = 60_000;
const CHECK_BAD_MS = 8_000;
const TIMEOUT_MS = 6_000;

async function probe() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "offline";
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`/api/health?t=${Date.now()}`, {
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (res.ok) return "ok";
    if (res.status === 503) {
      const body = await res.json().catch(() => null);
      if (body && body.db === false) return "db";
    }
    return "server";
  } catch {
    return navigator.onLine === false ? "offline" : "server";
  } finally {
    clearTimeout(timer);
  }
}

const ICONS = {
  offline: <DisconnectOutlined style={{ color: "#d4380d" }} />,
  server: <CloudServerOutlined style={{ color: "#cf1322" }} />,
  db: <DatabaseOutlined style={{ color: "#cf1322" }} />,
};

export default function ConnectionStatus() {
  const t = useTranslations("Connection");
  const [state, setState] = useState("ok");
  const [checking, setChecking] = useState(false);
  const stateRef = useRef("ok");
  const lastCheck = useRef(0);

  const check = useCallback(
    async (manual = false) => {
      lastCheck.current = Date.now();
      if (manual) setChecking(true);
      const next = await probe();
      if (manual) setChecking(false);
      if (next === "ok" && stateRef.current !== "ok") {
        message.success(t("Back"));
      }
      stateRef.current = next;
      setState(next);
    },
    [t],
  );

  // أحداث المتصفح: النت فصل / رجع، والشاشة رجعت للواجهة
  useEffect(() => {
    const onOffline = () => {
      stateRef.current = "offline";
      setState("offline");
    };
    const onOnline = () => check();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastCheck.current > 15_000) check();
      }
    };
    // طلب للسيرفر فشل في أي حتة (حفظ مثلاً): نفحص على طول
    const onRejection = (e) => {
      const msg = String(e?.reason?.message ?? e?.reason ?? "");
      if (/fetch|network|load failed/i.test(msg)) check();
    };
    if (navigator.onLine === false) onOffline();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [check]);

  // فحص دوري (أسرع وقت المشكلة عشان الشاشة تختفي أول ما الاتصال يرجع)
  useEffect(() => {
    const timer = setInterval(
      () => {
        if (document.visibilityState === "visible") check();
      },
      state === "ok" ? CHECK_OK_MS : CHECK_BAD_MS,
    );
    return () => clearInterval(timer);
  }, [state, check]);

  // صفحة offline.html لو الموقع اتفتح والنت أو السيرفر واقع (https فقط، وفي الإنتاج)
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator &&
      window.isSecureContext
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  if (state === "ok") return null;

  return (
    <div className="conn-overlay" role="alertdialog" aria-live="assertive">
      <div className="conn-overlay__card">
        <Result
          icon={ICONS[state]}
          title={t(`${state}.title`)}
          subTitle={t(`${state}.text`)}
          extra={
            <Button
              type="primary"
              size="large"
              icon={<ReloadOutlined />}
              loading={checking}
              onClick={() => check(true)}
            >
              {checking ? t("Checking") : t("Retry")}
            </Button>
          }
        >
          <ul className="conn-overlay__tips">
            {t.raw(`${state}.tips`).map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
          <div className="conn-overlay__note">{t("KeepData")}</div>
        </Result>
      </div>
    </div>
  );
}
