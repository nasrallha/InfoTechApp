"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Popover } from "antd";
import { BellOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useCan } from "@/components/auth/AuthProvider";
import { getZatcaAlertsAction } from "@/actions/zatca.actions";
import { modal } from "@/components/common/feedback";
import { C } from "@/lib/theme";
import "./zatca.css";

const POLL_MS = 2 * 60_000;
const SHOWN_KEY = "zatca-eod-alert";

// اليوم والوقت الحالي بتوقيت السعودية
function riyadhNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

// ============================================================
// جرس إشعارات الزكاة في الهيدر:
// فواتير معلّقة / مرفوضة / قربت مهلة الـ 24 ساعة / متوقعتش / شهادة قربت تنتهي / الخدمة واقفة
// + تنبيه آخر اليوم (مرة واحدة في اليوم) لو المعلّق >= الحد
// ============================================================
export default function ZatcaBell() {
  const can = useCan();
  const allowed = can("zatca.view");
  const [alerts, setAlerts] = useState(null);
  const t = useTranslations("Zatca");

  const load = useCallback(async () => {
    const res = await getZatcaAlertsAction();
    if (res.success) setAlerts(res.data);
  }, []);

  useEffect(() => {
    if (!allowed) return undefined;
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [allowed, load]);

  // تنبيه آخر اليوم
  useEffect(() => {
    if (!alerts?.enabled) return;
    const open = alerts.pending + alerts.errors + alerts.unsigned;
    const { day, time } = riyadhNow();
    if (time < alerts.alertTime || open < alerts.alertThreshold) return;
    let shown = null;
    try {
      shown = localStorage.getItem(SHOWN_KEY);
    } catch {
      // التخزين مش متاح
    }
    if (shown === day) return;
    try {
      localStorage.setItem(SHOWN_KEY, day);
    } catch {
      // التخزين مش متاح
    }
    modal.warning({
      title: t("EodTitle"),
      content: t("EodText", { count: open }),
      okText: t("Ok"),
    });
  }, [alerts, t]);

  if (!allowed || !alerts?.enabled) return null;

  const items = [
    !alerts.gatewayOnline && {
      key: "gw",
      label: t("bell.gateway"),
      danger: true,
    },
    alerts.overdue > 0 && {
      key: "overdue",
      label: t("bell.overdue"),
      count: alerts.overdue,
      danger: true,
    },
    alerts.rejected > 0 && {
      key: "rejected",
      label: t("bell.rejected"),
      count: alerts.rejected,
      danger: true,
    },
    alerts.errors > 0 && {
      key: "errors",
      label: t("bell.errors"),
      count: alerts.errors,
    },
    alerts.pending > 0 && {
      key: "pending",
      label: t("bell.pending"),
      count: alerts.pending,
    },
    alerts.unsigned > 0 && {
      key: "unsigned",
      label: t("bell.unsigned"),
      count: alerts.unsigned,
      danger: true,
    },
    ...alerts.expiring.map((e, i) => ({
      key: `cert${i}`,
      label: t("bell.cert", { branch: e.branch.arName, days: e.days }),
      danger: e.days <= 7,
    })),
  ].filter(Boolean);

  const total =
    alerts.pending +
    alerts.errors +
    alerts.rejected +
    alerts.unsigned +
    alerts.expiring.length +
    (alerts.gatewayOnline ? 0 : 1);
  const danger = items.some((i) => i.danger);

  return (
    <Popover
      trigger="click"
      title={t("bell.title")}
      onOpenChange={(o) => o && load()}
      content={
        items.length ? (
          <div>
            <ul className="zatca-bell-list">
              {items.map((i) => (
                <li key={i.key} style={i.danger ? { color: C.dangerText } : null}>
                  <span>{i.label}</span>
                  {i.count != null && <b>{i.count}</b>}
                </li>
              ))}
            </ul>
            <Link href="/zatca/documents">{t("OpenMonitoring")}</Link>
          </div>
        ) : (
          <span className="zatca-muted">{t("bell.allGood")}</span>
        )
      }
    >
      <Badge count={total} size="small" color={danger ? C.danger : C.warning}>
        <Button
          type="text"
          icon={<BellOutlined />}
          aria-label={t("bell.title")}
        />
      </Badge>
    </Popover>
  );
}
