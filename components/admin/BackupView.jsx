"use client";

import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
} from "antd";
import {
  CloudDownloadOutlined,
  CloudServerOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  UploadOutlined,
  ReloadOutlined,
  SaveOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/dates";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import PageHeader from "@/components/common/PageHeader";
import FolderBrowser from "./FolderBrowser";
import BackupScheduleCard from "./BackupScheduleCard";
import RestoreModal from "./RestoreModal";
import {
  createBackupAction,
  deleteBackupAction,
  listBackupsAction,
  saveBackupDirAction,
} from "@/actions/backup.actions";
import { C } from "@/lib/theme";
import "@/components/common/table.css";
import "./admin.css";

const KIND_COLOR = {
  auto: "purple",
  manual: "blue",
  uploaded: "cyan",
  safety: "orange",
};

const fmtSize = (b) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

// ============================================================
// الإدارة ← النسخ الاحتياطي لقاعدة البيانات
// - نسخة الآن (بتتحفظ في مجلد على السيرفر)
// - تنزيل أي نسخة على جهازك (المتصفح بيسألك تحفظها فين)
// - تغيير مجلد الحفظ على السيرفر (مثلاً D:\Backups أو هارد خارجي)
// ============================================================
// full: شاشة المالك (الإعدادات): المجلد + النسخ التلقائي + الاسترجاع والرفع والحذف
// غير كده: شاشة العميل (الإدارة): نسخة الآن + التنزيل بس
export default function BackupView({ initialData, perms, full = false }) {
  const [data, setData] = useState(initialData);
  const [dir, setDir] = useState(initialData.isDefault ? "" : initialData.dir);
  const [busy, setBusy] = useState(null);
  const [browsing, setBrowsing] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const fileInput = useRef(null);
  const locale = useLocale();
  const t = useTranslations("Backup");
  const tAlerts = useTranslations("Alerts");

  const fail = (res) => showActionError(res, tAlerts, locale);

  const reload = async () => {
    setBusy("reload");
    const res = await listBackupsAction();
    setBusy(null);
    if (!res.success) return fail(res);
    setData(res.data);
  };

  const create = async () => {
    setBusy("create");
    const res = await createBackupAction();
    if (!res.success) {
      setBusy(null);
      return fail(res);
    }
    message.success(
      t("Created", { size: fmtSize(res.data.size), seconds: res.data.seconds }),
    );
    await reload();
  };

  // رفع ملف نسخة من جهازك (عشان تسترجعه)
  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy("upload");
    try {
      const res = await fetch("/api/backups/upload", {
        method: "POST",
        headers: { "X-File-Name": encodeURIComponent(f.name) },
        body: f,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setBusy(null);
        return fail({ error: json.error || "UploadFailed" });
      }
      message.success(t("Uploaded"));
    } catch {
      setBusy(null);
      return fail({ error: "ConnectionLost" });
    }
    await reload();
  };

  const remove = async (name) => {
    setBusy(name);
    const res = await deleteBackupAction({ name });
    if (!res.success) {
      setBusy(null);
      return fail(res);
    }
    message.success(t("Deleted"));
    await reload();
  };

  const saveDir = async (value) => {
    setBusy("dir");
    const res = await saveBackupDirAction({ dir: value });
    setBusy(null);
    if (!res.success) return fail(res);
    setData(res.data);
    setDir(res.data.isDefault ? "" : res.data.dir);
    message.success(t("DirSaved"));
  };

  const columns = [
    {
      title: t("File"),
      dataIndex: "name",
      render: (v, r, i) => (
        <Space size={6}>
          <bdi className="backup-dir">{v}</bdi>
          {i === 0 && <Tag color="green">{t("Latest")}</Tag>}
        </Space>
      ),
    },
    {
      title: t("Type"),
      dataIndex: "kind",
      render: (kind) => (
        <Tag color={KIND_COLOR[kind] ?? "blue"}>
          {t(`kind.${kind ?? "manual"}`)}
        </Tag>
      ),
    },
    {
      title: t("Date"),
      dataIndex: "createdAt",
      render: (v) => formatDateTime(v),
    },
    {
      title: t("Size"),
      dataIndex: "size",
      align: "end",
      render: (v) => <bdi>{fmtSize(v)}</bdi>,
    },
    {
      title: "",
      key: "actions",
      width: 110,
      render: (_, r) => (
        <Space>
          {perms.download && (
            <Tooltip title={t("Download")}>
              <Button
                size="small"
                icon={<CloudDownloadOutlined />}
                href={`/api/backups/${encodeURIComponent(r.name)}`}
              />
            </Tooltip>
          )}
          {perms.restore && (
            <Tooltip title={t("Restore")}>
              <Button
                size="small"
                icon={<HistoryOutlined />}
                onClick={() => setRestoring(r)}
              />
            </Tooltip>
          )}
          {perms.delete && (
            <Popconfirm
              title={t("DeleteConfirm")}
              okButtonProps={{ danger: true }}
              onConfirm={() => remove(r.name)}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={busy === r.name}
              />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={full ? t("TitleOwner") : t("Title")}
        extra={
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              loading={busy === "reload"}
              onClick={reload}
            >
              {t("Refresh")}
            </Button>
            {perms.restore && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".sql"
                  style={{ display: "none" }}
                  onChange={upload}
                />
                <Button
                  icon={<UploadOutlined />}
                  loading={busy === "upload"}
                  onClick={() => fileInput.current?.click()}
                >
                  {t("UploadBackup")}
                </Button>
              </>
            )}
            {perms.create && (
              <Button
                type="primary"
                icon={<CloudServerOutlined />}
                loading={busy === "create" || data.running}
                onClick={create}
              >
                {t("CreateNow")}
              </Button>
            )}
          </Space>
        }
      />

      {/* كارت المجلد وكارت النسخ التلقائي جنب بعض */}
      <div className="settings-masonry">
        {full && (
          <Card
            size="small"
            className="mb-4"
            title={
              <span>
                <FolderOpenOutlined /> {t("Folder")}
              </span>
            }
          >
            <div className="mb-2">
              <span className="backup-dir">{data.dir}</span>
              {data.isDefault && (
                <Tag className="ms-2" color="blue">
                  {t("DefaultFolder")}
                </Tag>
              )}
            </div>
            <div style={{ color: C.muted, fontSize: 13 }} className="mb-3">
              {t("FolderHint")}
            </div>
            {perms.settings && (
              <Button
                size="large"
                className="backup-browse-btn mb-3"
                icon={<FolderOpenOutlined />}
                disabled={busy === "dir"}
                onClick={() => setBrowsing(true)}
              >
                {t("Browse")}
              </Button>
            )}
            {perms.settings && (
              <Space.Compact style={{ width: "100%", maxWidth: 640 }}>
                <Input
                  dir="ltr"
                  value={dir}
                  onChange={(e) => setDir(e.target.value)}
                  placeholder={t("FolderPlaceholder")}
                  onPressEnter={() => saveDir(dir)}
                />
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={busy === "dir"}
                  onClick={() => saveDir(dir)}
                >
                  {t("SaveFolder")}
                </Button>
                {!data.isDefault && (
                  <Tooltip title={t("UseDefault")}>
                    <Button
                      icon={<UndoOutlined />}
                      disabled={busy === "dir"}
                      onClick={() => saveDir("")}
                    />
                  </Tooltip>
                )}
              </Space.Compact>
            )}
          </Card>
        )}

        {perms.settings && (
          <FolderBrowser
            open={browsing}
            start={data.dir}
            onClose={() => setBrowsing(false)}
            onSelect={(path) => {
              setBrowsing(false);
              setDir(path);
              saveDir(path);
            }}
          />
        )}

        {full && data.schedule && (
          <BackupScheduleCard
            key={JSON.stringify(data.schedule)}
            schedule={data.schedule}
            canEdit={perms.settings}
            onSaved={(fresh) => setData(fresh)}
          />
        )}
      </div>

      <Table
        rowKey="name"
        size="small"
        columns={columns}
        dataSource={data.files}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: t("Empty") }}
        className="mb-4"
      />

      {perms.restore && (
        <RestoreModal file={restoring} onClose={() => setRestoring(null)} />
      )}

      {full && (
        <Alert
          type="info"
          showIcon
          style={{ maxWidth: 860 }}
          title={t("RestoreManualTitle")}
          description={
            <div>
              <div className="mb-1">{t("RestoreHint")}</div>
              <code className="backup-dir">
                {`mysql -u root -p --default-character-set=utf8mb4 ${data.database} < ${data.files[0]?.name ?? "backup.sql"}`}
              </code>
            </div>
          }
        />
      )}
    </>
  );
}
