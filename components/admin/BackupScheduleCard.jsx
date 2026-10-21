"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Radio,
  Select,
  Space,
  Switch,
  Tag,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FieldTimeOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/dates";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useDuration } from "@/components/settings/security/securityUi";
import { saveBackupScheduleAction } from "@/actions/backup.actions";
import {
  BACKUP_EVERY_HOURS,
  BACKUP_FREQUENCIES,
  BACKUP_KEEP,
  BACKUP_TIMES,
} from "@/lib/backup-schedule";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

// ============================================================
// النسخ الاحتياطي التلقائي: تشغيل/إيقاف، الميعاد، عدد النسخ اللي تتساب
// + آخر نسخة تلقائية (نجحت / فشلت وليه) + النسخة الجاية إمتى
// ============================================================
export default function BackupScheduleCard({ schedule, canEdit, onSaved }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const values = Form.useWatch([], form) ?? schedule;
  const locale = useLocale();
  const t = useTranslations("Backup");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const dur = useDuration();

  const on = values.backupAutoEnabled;
  const freq = values.backupFrequency;

  const save = async (data) => {
    setSaving(true);
    const res = await saveBackupScheduleAction(data);
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("ScheduleSaved"));
    onSaved?.(res.data);
  };

  return (
    <Card
      size="small"
      className="mb-4"
      style={{ maxWidth: 860 }}
      title={
        <span>
          <FieldTimeOutlined /> {t("AutoTitle")}
        </span>
      }
      extra={
        schedule.backupAutoEnabled ? (
          <Tag color="green">{t("AutoOn")}</Tag>
        ) : (
          <Tag>{t("AutoOff")}</Tag>
        )
      }
    >
      {/* الحالة: آخر نسخة + الجاية */}
      {schedule.backupAutoEnabled && (
        <div className="mb-3" style={{ display: "grid", gap: 4 }}>
          {schedule.nextAt && (
            <div>
              <ClockCircleOutlined /> {t("NextRun")}:{" "}
              <b>{formatDateTime(schedule.nextAt)}</b>
            </div>
          )}
          {schedule.lastAutoBackupAt && (
            <div>
              <CheckCircleOutlined style={{ color: "#52c41a" }} />{" "}
              {t("LastAutoOk")}:{" "}
              <b>{formatDateTime(schedule.lastAutoBackupAt)}</b>
              {schedule.lastAutoBackupFile && (
                <span className="backup-dir" style={{ marginInlineStart: 8 }}>
                  {schedule.lastAutoBackupFile}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {schedule.backupAutoEnabled && schedule.lastAutoBackupOk === false && (
        <Alert
          type="error"
          showIcon
          icon={<CloseCircleOutlined />}
          className="mb-3"
          title={t("LastAutoFailed")}
          description={<span dir="auto">{schedule.lastAutoBackupError}</span>}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        disabled={!canEdit}
        initialValues={{
          backupAutoEnabled: schedule.backupAutoEnabled,
          backupFrequency: schedule.backupFrequency,
          backupEveryHours: schedule.backupEveryHours,
          backupTime: schedule.backupTime,
          backupWeekday: schedule.backupWeekday,
          backupKeep: schedule.backupKeep,
        }}
        onFinish={save}
      >
        <Form.Item
          name="backupAutoEnabled"
          label={t("AutoEnable")}
          extra={t("AutoEnableHint")}
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item name="backupFrequency" label={t("Frequency")}>
          <Radio.Group
            disabled={!on}
            optionType="button"
            buttonStyle="solid"
            options={BACKUP_FREQUENCIES.map((f) => ({
              value: f,
              label: t(`freq.${f}`),
            }))}
          />
        </Form.Item>

        <Space wrap size={16}>
          {freq === "hours" && (
            <Form.Item name="backupEveryHours" label={t("EveryHours")}>
              <Select
                disabled={!on}
                style={{ width: 200 }}
                options={BACKUP_EVERY_HOURS.map((h) => ({
                  value: h,
                  label: t("Every", { time: dur(h * 60) }),
                }))}
              />
            </Form.Item>
          )}
          {freq === "weekly" && (
            <Form.Item name="backupWeekday" label={t("Weekday")}>
              <Select
                disabled={!on}
                style={{ width: 200 }}
                options={WEEKDAYS.map((d) => ({
                  value: d,
                  label: t(`weekday.${d}`),
                }))}
              />
            </Form.Item>
          )}
          {freq !== "hours" && (
            <Form.Item
              name="backupTime"
              label={t("AtTime")}
              extra={t("AtTimeHint")}
            >
              <Select
                disabled={!on}
                style={{ width: 200 }}
                showSearch
                options={BACKUP_TIMES.map((v) => ({ value: v, label: v }))}
              />
            </Form.Item>
          )}
          <Form.Item name="backupKeep" label={t("Keep")} extra={t("KeepHint")}>
            <Select
              disabled={!on}
              style={{ width: 240 }}
              options={BACKUP_KEEP.map((n) => ({
                value: n,
                label: n === 0 ? t("KeepAll") : t("KeepLast", { n }),
              }))}
            />
          </Form.Item>
        </Space>

        <Alert type="info" showIcon className="mb-3" title={t("AutoNote")} />

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
    </Card>
  );
}
