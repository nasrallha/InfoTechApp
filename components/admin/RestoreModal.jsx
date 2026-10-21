"use client";

import { useState } from "react";
import { Alert, Input, Modal } from "antd";
import { HistoryOutlined, WarningOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/dates";
import { modal } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { restoreBackupAction } from "@/actions/backup.actions";

// ============================================================
// استرجاع نسخة احتياطية (مالك البرنامج)
// - تحذيرات واضحة + كتابة كلمة التأكيد
// - البرنامج بياخد نسخة أمان من الوضع الحالي قبل الاسترجاع
// - بعد النجاح: كل المستخدمين بيخرجوا (حتى إنت) ← صفحة الدخول
// ============================================================
export default function RestoreModal({ file, onClose }) {
  const [confirm, setConfirm] = useState("");
  const [running, setRunning] = useState(false);
  const locale = useLocale();
  const t = useTranslations("Backup");
  const tAlerts = useTranslations("Alerts");
  const word = locale === "ar" ? "استرجاع" : "RESTORE";

  const run = async () => {
    setRunning(true);
    const res = await restoreBackupAction({ name: file.name, confirm });
    setRunning(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    const r = res.data;
    modal.success({
      title: t("RestoreDone"),
      content: (
        <div>
          <p>{t("RestoreDoneText", { safety: r.safety })}</p>
          {r.migrated > 0 && (
            <Alert
              className="mb-2"
              showIcon
              type={r.migrateOk ? "info" : "error"}
              title={
                r.migrateOk
                  ? t("RestoreMigrated", { count: r.migrated })
                  : t("RestoreMigrateFailed")
              }
            />
          )}
          {r.zatcaGap > 0 && (
            <Alert
              showIcon
              type="warning"
              title={t("RestoreZatcaGap", { count: r.zatcaGap })}
            />
          )}
        </div>
      ),
      okText: t("GoLogin"),
      onOk: () => {
        window.location.href = `/${locale}/login`;
      },
    });
  };

  return (
    <Modal
      open={!!file}
      onCancel={running ? undefined : onClose}
      mask={{ closable: !running }}
      closable={!running}
      title={
        <span style={{ color: "#cf1322" }}>
          <HistoryOutlined /> {t("RestoreTitle")}
        </span>
      }
      okText={t("RestoreConfirmButton")}
      okButtonProps={{ danger: true, disabled: confirm.trim() !== word }}
      cancelButtonProps={{ disabled: running }}
      confirmLoading={running}
      onOk={run}
    >
      {file && (
        <>
          <p>
            {t("RestoreFile")}: <bdi className="backup-dir">{file.name}</bdi>
            <br />
            {t("Date")}: <b>{formatDateTime(file.createdAt)}</b>
          </p>
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined />}
            className="mb-3"
            title={t("RestoreWarnTitle")}
            description={
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                <li>{t("RestoreWarn1")}</li>
                <li>{t("RestoreWarn2")}</li>
                <li>{t("RestoreWarn3")}</li>
                <li>{t("RestoreWarn4")}</li>
              </ul>
            }
          />
          <div className="mb-1">{t("RestoreType", { word })}</div>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={word}
            disabled={running}
            style={{ maxWidth: 260 }}
          />
          {running && (
            <Alert
              type="info"
              showIcon
              className="mt-3"
              title={t("RestoreRunning")}
            />
          )}
        </>
      )}
    </Modal>
  );
}
