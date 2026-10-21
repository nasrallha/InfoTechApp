"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { logoutAction } from "@/actions/auth.actions";
import { touchSessionAction } from "@/actions/login-security.actions";

// ============================================================
// متابعة نشاط المستخدم (الماوس / الكيبورد / اللمس)
// - كل دقيقة فيها نشاط: بنبلّغ السيرفر (آخر نشاط للجلسة + شاشة الأجهزة)
// - الخروج بعد عدم نشاط (من إعدادات الدخول): تنبيه قبلها بدقيقة،
//   ولو مفيش رد: خروج وتحويل لصفحة الدخول
// - أكتر من تبويب مفتوح: النشاط في أي تبويب بيحسب للكل
// - لو الجلسة اتقفلت من السيرفر (المدير أخرج الجهاز / انتهت المدة): صفحة الدخول
// ============================================================

const BEAT_MS = 60_000;
const WARN_MS = 60_000;
const KEY = "erp-last-activity";
const EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "wheel",
  "scroll",
];

export default function IdleGuard({ idleMinutes = 0 }) {
  const [warn, setWarn] = useState(null); // ثواني متبقية قبل الخروج
  const last = useRef(0);
  const lastBeat = useRef(0);
  const activeSinceBeat = useRef(false);
  const leaving = useRef(false);
  const locale = useLocale();
  const t = useTranslations("Security");

  const mark = useRef(() => {});
  mark.current = () => {
    const now = Date.now();
    if (now - last.current < 1000) return;
    last.current = now;
    activeSinceBeat.current = true;
    try {
      localStorage.setItem(KEY, String(now));
    } catch {
      // تخزين المتصفح مقفول: كل تبويب لوحده
    }
  };

  useEffect(() => {
    last.current = Date.now();
    lastBeat.current = Date.now();

    const goLogin = (reason) => {
      if (leaving.current) return;
      leaving.current = true;
      window.location.href = `/${locale}/login?reason=${reason}`;
    };
    const logoutNow = async () => {
      if (leaving.current) return;
      await logoutAction().catch(() => {});
      goLogin("idle");
    };

    const onActivity = () => mark.current();
    const onStorage = (e) => {
      if (e.key !== KEY || !e.newValue) return;
      const v = Number(e.newValue);
      if (v > last.current) last.current = v;
    };
    EVENTS.forEach((ev) =>
      document.addEventListener(ev, onActivity, {
        capture: true,
        passive: true,
      }),
    );
    window.addEventListener("storage", onStorage);

    let beating = false;
    const tick = async () => {
      if (leaving.current) return;
      const now = Date.now();

      if (idleMinutes > 0) {
        const left = idleMinutes * 60_000 - (now - last.current);
        if (left <= 0) return logoutNow();
        setWarn(left <= WARN_MS ? Math.ceil(left / 1000) : null);
      }

      if (
        !beating &&
        activeSinceBeat.current &&
        now - lastBeat.current >= BEAT_MS
      ) {
        beating = true;
        activeSinceBeat.current = false;
        lastBeat.current = now;
        const res = await touchSessionAction().catch(() => null);
        beating = false;
        if (res && !res.success && res.error === "SessionExpired")
          goLogin("expired");
      }
    };
    const timer = setInterval(tick, 1000);

    return () => {
      clearInterval(timer);
      EVENTS.forEach((ev) =>
        document.removeEventListener(ev, onActivity, { capture: true }),
      );
      window.removeEventListener("storage", onStorage);
    };
  }, [idleMinutes, locale]);

  return (
    <Modal
      open={warn != null}
      closable={false}
      mask={{ closable: false }}
      keyboard={false}
      title={
        <span>
          <ClockCircleOutlined /> {t("IdleWarnTitle")}
        </span>
      }
      footer={
        <Button type="primary" onClick={() => mark.current()}>
          {t("StillHere")}
        </Button>
      }
    >
      <p>{t("IdleWarnText")}</p>
      <div style={{ fontSize: 32, fontWeight: 700, textAlign: "center" }}>
        {warn}
      </div>
    </Modal>
  );
}
