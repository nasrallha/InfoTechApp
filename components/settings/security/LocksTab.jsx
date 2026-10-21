"use client";

import { useState } from "react";
import { Button, Empty, Popconfirm, Table, Tag, Tooltip } from "antd";
import { ReloadOutlined, UnlockOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/dates";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import {
  listLocksAction,
  unlockAction,
} from "@/actions/login-security.actions";
import { Ip, UserCell, useAgo, useDuration } from "./securityUi";

// ============================================================
// الحسابات والأجهزة المقفولة دلوقتي (محاولات غلط كتير) + فك القفل يدوياً
// ============================================================
export default function LocksTab({ initial, onCount }) {
  const [rows, setRows] = useState(initial ?? []);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const locale = useLocale();
  const t = useTranslations("Security");
  const tAlerts = useTranslations("Alerts");
  const dur = useDuration();
  const ago = useAgo();

  const apply = (list) => {
    setRows(list);
    onCount?.(list.length);
  };

  const load = async () => {
    setLoading(true);
    const res = await listLocksAction();
    setLoading(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    apply(res.data);
  };

  const unlock = async (row) => {
    setBusy(row.id);
    const res = await unlockAction(row.id);
    setBusy(null);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Unlocked"));
    apply(rows.filter((r) => r.id !== row.id));
  };

  const columns = [
    {
      title: t("LockedWho"),
      key: "who",
      render: (_, r) =>
        r.kind === "ip" ? (
          <span>
            <Tag color="purple">{t("kind.ip")}</Tag> <Ip ip={r.key} />
          </span>
        ) : (
          <UserCell user={r.user} typed={r.key} />
        ),
    },
    {
      title: t("LockedUntil"),
      key: "until",
      render: (_, r) => (
        <Tooltip title={formatDateTime(r.lockedUntil)}>
          <Tag color="volcano">
            {t("RemainingTime", { time: dur(r.minutes) })}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: t("LockTimes"),
      dataIndex: "lockCount",
      render: (n) => <b>{n}</b>,
    },
    {
      title: t("LastFail"),
      dataIndex: "lastFailAt",
      render: (v) => <Tooltip title={formatDateTime(v)}>{ago(v)}</Tooltip>,
    },
    {
      title: "",
      key: "actions",
      render: (_, r) => (
        <Popconfirm title={t("UnlockConfirm")} onConfirm={() => unlock(r)}>
          <Button
            size="small"
            type="primary"
            icon={<UnlockOutlined />}
            loading={busy === r.id}
          >
            {t("Unlock")}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <div className="sec-toolbar">
        <div className="sec-stat">
          <span>{t("LockedNow")}</span>
          <b>{rows.length}</b>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          {t("Refresh")}
        </Button>
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: "max-content" }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("NoLocks")}
            />
          ),
        }}
      />
    </>
  );
}
