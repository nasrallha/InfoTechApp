"use client";

import { useState } from "react";
import { Alert, Button, Card, Form, Radio, Select, Switch } from "antd";
import {
  ClockCircleOutlined,
  FileSearchOutlined,
  LaptopOutlined,
  LockOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { saveSecuritySettingsAction } from "@/actions/login-security.actions";
import {
  DEFAULT_SECURITY,
  DEVICE_LIMIT_MODES,
  SECURITY_OPTIONS,
  lockDuration,
} from "@/lib/login-security";
import { useDuration } from "./securityUi";

const FIELDS = Object.keys(DEFAULT_SECURITY);

// ============================================================
// إعدادات الدخول: القفل بعد المحاولات الغلط، مدة الجلسة، عدم النشاط، عدد الأجهزة
// كل حاجة اختيار من قايمة، وفوق ملخص بالكلام لكل اللي هيحصل
// ============================================================
export default function SecuritySettingsForm({ settings, canEdit }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const values = Form.useWatch([], form) ?? settings;
  const locale = useLocale();
  const t = useTranslations("Security");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const dur = useDuration();

  const initial = Object.fromEntries(
    FIELDS.map((k) => [k, settings?.[k] ?? DEFAULT_SECURITY[k]]),
  );
  const v = { ...initial, ...values };

  const onFinish = async (data) => {
    setSaving(true);
    const res = await saveSecuritySettingsAction(data);
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(tAlerts("SettingsSaved"));
  };

  // اختيارات القوايم
  const opts = (list, label) =>
    list.map((n) => ({ value: n, label: label(n) }));
  const minutesOpts = (list, zero) =>
    opts(list, (n) => (n === 0 ? zero : dur(n)));
  const countOpts = (list, zero, key) =>
    opts(list, (n) => (n === 0 ? zero : t(key, { n })));

  // سلسلة القفل المتزايد: 10 دقائق ← 30 دقيقة ← ساعة ...
  const chain = [0, 1, 2, 3]
    .map((i) =>
      dur(
        lockDuration({ lockMinutes: v.lockMinutes, progressiveLock: true }, i),
      ),
    )
    .join(" ← ");

  const lockOn = v.maxAttempts > 0;
  const devicesOn = v.maxDevices > 0;

  // ---------- الملخص بالكلام ----------
  const summary = [
    lockOn
      ? t("SumLock", {
          attempts: t("Attempts", { n: v.maxAttempts }),
          window: dur(v.attemptWindowMinutes),
          lock: dur(v.lockMinutes),
        }) + (v.progressiveLock ? ` ${t("SumProgressive")}` : "")
      : t("SumNoLock"),
    v.ipMaxAttempts > 0
      ? t("SumIp", {
          attempts: t("Attempts", { n: v.ipMaxAttempts }),
          lock: dur(v.lockMinutes),
        })
      : null,
    t("SumSession", { time: dur(v.sessionHours * 60) }) +
      (v.logoutOnBrowserClose ? ` ${t("SumBrowserClose")}` : ""),
    v.idleMinutes > 0
      ? t("SumIdle", { time: dur(v.idleMinutes) })
      : t("SumNoIdle"),
    devicesOn
      ? t(
          v.deviceLimitMode === "reject"
            ? "SumDevicesReject"
            : "SumDevicesOldest",
          {
            devices: t("Devices", { n: v.maxDevices }),
          },
        ) + (v.deviceLimitSkipSuper ? ` ${t("SumSkipSuper")}` : "")
      : t("SumNoDevices"),
  ].filter(Boolean);

  const card = (icon, title) => (
    <span>
      {icon} {title}
    </span>
  );

  return (
    <div style={{ maxWidth: 820 }}>
      {!canEdit && (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title={tAlerts("ReadOnlyNoPermission")}
        />
      )}

      <Alert
        type="success"
        className="mb-4"
        title={t("SummaryTitle")}
        description={
          <ul className="sec-summary">
            {summary.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        }
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={initial}
        onFinish={onFinish}
        disabled={!canEdit}
      >
        {/* ============ القفل بعد المحاولات الغلط ============ */}
        <Card
          size="small"
          className="mb-4"
          title={card(<LockOutlined />, t("CardLock"))}
        >
          <div className="sec-grid">
            <Form.Item
              name="maxAttempts"
              label={t("MaxAttempts")}
              extra={t("MaxAttemptsHint")}
            >
              <Select
                options={countOpts(
                  SECURITY_OPTIONS.maxAttempts,
                  t("NoLock"),
                  "Attempts",
                )}
              />
            </Form.Item>
            <Form.Item
              name="attemptWindowMinutes"
              label={t("AttemptWindow")}
              extra={t("AttemptWindowHint")}
            >
              <Select
                disabled={!lockOn}
                options={minutesOpts(SECURITY_OPTIONS.attemptWindowMinutes)}
              />
            </Form.Item>
            <Form.Item name="lockMinutes" label={t("LockMinutes")}>
              <Select
                disabled={!lockOn && !(v.ipMaxAttempts > 0)}
                options={minutesOpts(SECURITY_OPTIONS.lockMinutes)}
              />
            </Form.Item>
            <Form.Item
              name="ipMaxAttempts"
              label={t("IpMaxAttempts")}
              extra={t("IpMaxAttemptsHint")}
            >
              <Select
                options={countOpts(
                  SECURITY_OPTIONS.ipMaxAttempts,
                  t("NoIpLock"),
                  "Attempts",
                )}
              />
            </Form.Item>
          </div>
          <Form.Item
            name="progressiveLock"
            label={t("Progressive")}
            extra={t("ProgressiveHint", { chain })}
            valuePropName="checked"
          >
            <Switch disabled={!lockOn} />
          </Form.Item>
          <Form.Item
            name="showRemaining"
            label={t("ShowRemaining")}
            extra={t("ShowRemainingHint")}
            valuePropName="checked"
            className="mb-0"
          >
            <Switch disabled={!lockOn} />
          </Form.Item>
        </Card>

        {/* ============ الجلسة ============ */}
        <Card
          size="small"
          className="mb-4"
          title={card(<ClockCircleOutlined />, t("CardSession"))}
        >
          <div className="sec-grid">
            <Form.Item
              name="sessionHours"
              label={t("SessionHours")}
              extra={t("SessionHoursHint")}
            >
              <Select
                options={opts(SECURITY_OPTIONS.sessionHours, (h) =>
                  dur(h * 60),
                )}
              />
            </Form.Item>
            <Form.Item
              name="idleMinutes"
              label={t("IdleMinutes")}
              extra={t("IdleMinutesHint")}
            >
              <Select
                options={minutesOpts(SECURITY_OPTIONS.idleMinutes, t("NoIdle"))}
              />
            </Form.Item>
          </div>
          <Form.Item
            name="logoutOnBrowserClose"
            label={t("BrowserClose")}
            extra={t("BrowserCloseHint")}
            valuePropName="checked"
            className="mb-0"
          >
            <Switch />
          </Form.Item>
        </Card>

        {/* ============ الأجهزة ============ */}
        <Card
          size="small"
          className="mb-4"
          title={card(<LaptopOutlined />, t("CardDevices"))}
        >
          <Form.Item
            name="maxDevices"
            label={t("MaxDevices")}
            extra={t("MaxDevicesHint")}
          >
            <Select
              style={{ maxWidth: 360 }}
              options={countOpts(
                SECURITY_OPTIONS.maxDevices,
                t("NoDeviceLimit"),
                "Devices",
              )}
            />
          </Form.Item>
          <Form.Item name="deviceLimitMode" label={t("DeviceMode")}>
            <Radio.Group disabled={!devicesOn} className="sec-radios">
              {DEVICE_LIMIT_MODES.map((m) => (
                <Radio key={m} value={m}>
                  <b>{t(`mode.${m}`)}</b>
                  <div className="sec-muted">{t(`modeHint.${m}`)}</div>
                </Radio>
              ))}
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="deviceLimitSkipSuper"
            label={t("SkipSuper")}
            extra={t("SkipSuperHint")}
            valuePropName="checked"
            className="mb-0"
          >
            <Switch disabled={!devicesOn} />
          </Form.Item>
        </Card>

        {/* ============ سجل الدخول ============ */}
        <Card
          size="small"
          className="mb-4"
          title={card(<FileSearchOutlined />, t("CardLog"))}
        >
          <Form.Item
            name="logRetentionDays"
            label={t("LogRetention")}
            extra={t("LogRetentionHint")}
            className="mb-0"
          >
            <Select
              style={{ maxWidth: 360 }}
              options={opts(SECURITY_OPTIONS.logRetentionDays, (d) =>
                dur(d * 1440),
              )}
            />
          </Form.Item>
        </Card>

        {canEdit && (
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={saving}
          >
            {tButtons("Save")}
          </Button>
        )}
      </Form>
    </div>
  );
}
