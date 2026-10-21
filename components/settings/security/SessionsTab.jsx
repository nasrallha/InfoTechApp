"use client";

import { useMemo, useState } from "react";
import { Button, Popconfirm, Space, Table, Tag, Tooltip } from "antd";
import {
  LogoutOutlined,
  ReloadOutlined,
  UserDeleteOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/dates";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import {
  endSessionAction,
  endUserSessionsAction,
  listSessionsAction,
} from "@/actions/login-security.actions";
import { DeviceCell, Ip, UserCell, useAgo } from "./securityUi";

// ============================================================
// الأجهزة المسجّلة: كل جلسة مفتوحة دلوقتي (مين، من أنهي جهاز، آخر نشاط)
// فوق: عدد الأجهزة لكل مستخدم (الضغط عليه يفلتر الجدول)
// ============================================================
export default function SessionsTab({ initial, canEnd }) {
  const [rows, setRows] = useState(initial ?? []);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [userId, setUserId] = useState(null);
  const locale = useLocale();
  const t = useTranslations("Security");
  const tAlerts = useTranslations("Alerts");
  const ago = useAgo();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const fail = (res) => showActionError(res, tAlerts, locale);

  const load = async () => {
    setLoading(true);
    const res = await listSessionsAction();
    setLoading(false);
    if (!res.success) return fail(res);
    setRows(res.data);
  };

  const endOne = async (row) => {
    setBusy(`s${row.id}`);
    const res = await endSessionAction(row.id);
    setBusy(null);
    if (!res.success) return fail(res);
    message.success(t("SessionEnded"));
    load();
  };

  const endAll = async (user) => {
    setBusy(`u${user.id}`);
    const res = await endUserSessionsAction(user.id);
    setBusy(null);
    if (!res.success) return fail(res);
    message.success(t("UserSessionsEnded", { count: res.data.ended }));
    load();
  };

  // عدد الأجهزة لكل مستخدم
  const perUser = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const e = map.get(r.user.id) ?? { user: r.user, count: 0 };
      e.count++;
      map.set(r.user.id, e);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [rows]);

  const shown = userId ? rows.filter((r) => r.user.id === userId) : rows;

  const columns = [
    {
      title: t("User"),
      key: "user",
      render: (_, r) => <UserCell user={r.user} />,
    },
    {
      title: t("Device"),
      key: "device",
      render: (_, r) => (
        <Space size={4} wrap>
          <DeviceCell device={r.device} userAgent={r.userAgent} />
          {r.current && <Tag color="blue">{t("ThisDevice")}</Tag>}
        </Space>
      ),
    },
    { title: t("Ip"), dataIndex: "ip", render: (ip) => <Ip ip={ip} /> },
    { title: t("Branch"), key: "branch", render: (_, r) => nm(r.branch) },
    {
      title: t("LoginAt"),
      dataIndex: "createdAt",
      render: (v) => formatDateTime(v),
    },
    {
      title: t("LastSeen"),
      dataIndex: "lastSeenAt",
      render: (v) => <Tooltip title={formatDateTime(v)}>{ago(v)}</Tooltip>,
    },
    {
      title: t("ExpiresAt"),
      dataIndex: "expiresAt",
      render: (v) => formatDateTime(v),
    },
    canEnd && {
      title: "",
      key: "actions",
      render: (_, r) =>
        r.current ? null : (
          <Space size={4}>
            <Popconfirm
              title={t("EndSessionConfirm")}
              onConfirm={() => endOne(r)}
            >
              <Button
                size="small"
                danger
                icon={<LogoutOutlined />}
                loading={busy === `s${r.id}`}
              >
                {t("EndSession")}
              </Button>
            </Popconfirm>
          </Space>
        ),
    },
  ].filter(Boolean);

  return (
    <>
      <div className="sec-toolbar">
        <div className="sec-stat">
          <span>{t("ActiveDevices")}</span>
          <b>{rows.length}</b>
        </div>
        <div className="sec-stat">
          <span>{t("ActiveUsers")}</span>
          <b>{perUser.length}</b>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          {t("Refresh")}
        </Button>
      </div>

      {perUser.length > 0 && (
        <div className="sec-users">
          {perUser.map(({ user, count }) => (
            <div
              key={user.id}
              className={`sec-chip ${userId === user.id ? "is-active" : ""}`}
            >
              <button
                type="button"
                onClick={() => setUserId(userId === user.id ? null : user.id)}
              >
                {locale === "ar" ? user.arFullname : user.enFullname}{" "}
                <Tag color={count > 1 ? "orange" : "green"}>
                  {t("DevicesCount", { n: count })}
                </Tag>
              </button>
              {canEnd && (
                <Popconfirm
                  title={t("EndUserSessionsConfirm", {
                    name: locale === "ar" ? user.arFullname : user.enFullname,
                  })}
                  onConfirm={() => endAll(user)}
                >
                  <Tooltip title={t("EndUserSessions")}>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<UserDeleteOutlined />}
                      loading={busy === `u${user.id}`}
                    />
                  </Tooltip>
                </Popconfirm>
              )}
            </div>
          ))}
        </div>
      )}

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={shown}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: t("NoSessions") }}
      />
    </>
  );
}
