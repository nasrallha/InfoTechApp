"use client";

import { useState } from "react";
import { Badge, Tabs } from "antd";
import {
  FileSearchOutlined,
  LaptopOutlined,
  LockOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import SecuritySettingsForm from "./SecuritySettingsForm";
import SessionsTab from "./SessionsTab";
import LoginLogTab from "./LoginLogTab";
import LocksTab from "./LocksTab";
import "@/components/common/table.css";
import "./security.css";

// ============================================================
// الإعدادات ← الدخول والأمان
// تبويبات: إعدادات الدخول | الأجهزة المسجّلة | سجل الدخول | الحسابات المقفولة
// (كل تبويب بيظهر بصلاحيته)
// ============================================================
export default function SecurityView({
  perms,
  settings,
  sessions,
  log,
  logFilters,
  users,
  locks,
}) {
  const t = useTranslations("Security");
  const [lockCount, setLockCount] = useState(locks?.length ?? 0);

  const label = (icon, text, count) => (
    <span>
      {icon} {text}
      {count > 0 && (
        <Badge count={count} size="small" style={{ marginInlineStart: 6 }} />
      )}
    </span>
  );

  const items = [
    perms.settings && {
      key: "settings",
      label: label(<SettingOutlined />, t("TabSettings")),
      children: (
        <SecuritySettingsForm settings={settings} canEdit={perms.update} />
      ),
    },
    perms.sessions && {
      key: "sessions",
      label: label(<LaptopOutlined />, t("TabSessions")),
      children: <SessionsTab initial={sessions} canEnd={perms.endSessions} />,
    },
    perms.log && {
      key: "log",
      label: label(<FileSearchOutlined />, t("TabLog")),
      children: (
        <LoginLogTab initial={log} initialFilters={logFilters} users={users} />
      ),
    },
    perms.unlock && {
      key: "locks",
      label: label(<LockOutlined />, t("TabLocks"), lockCount),
      children: <LocksTab initial={locks} onCount={setLockCount} />,
    },
  ].filter(Boolean);

  return (
    <>
      <PageHeader title={t("Title")} />
      <Tabs items={items} destroyOnHidden={false} />
    </>
  );
}
