"use client";

import { useState } from "react";
import { Alert, Button, Col, Row, Select, Table, Tag } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/dates";
import { showActionError } from "@/components/common/actionError";
import DayPicker from "@/components/common/DayPicker";
import { listLoginLogAction } from "@/actions/login-security.actions";
import { DeviceCell, Ip, UserCell } from "./securityUi";

const RESULTS = ["all", "success", "failed"];
const REASON_COLOR = {
  ok: "green",
  invalid: "red",
  locked: "volcano",
  ipLocked: "volcano",
  disabled: "default",
  branchInactive: "default",
  deviceLimit: "orange",
};

// ============================================================
// سجل الدخول: كل محاولة (ناجحة أو فاشلة) بالوقت والجهاز والسبب
// ============================================================
export default function LoginLogTab({ initial, initialFilters, users }) {
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const locale = useLocale();
  const t = useTranslations("Security");
  const tAlerts = useTranslations("Alerts");

  const load = async (next = filters) => {
    setFilters(next);
    setLoading(true);
    const res = await listLoginLogAction(next);
    setLoading(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    setData(res.data);
  };
  const set = (patch) => load({ ...filters, ...patch });

  const columns = [
    {
      title: t("Time"),
      dataIndex: "createdAt",
      render: (v) => formatDateTime(v),
    },
    {
      title: t("User"),
      key: "user",
      render: (_, r) => <UserCell user={r.user} typed={r.username} />,
    },
    {
      title: t("Result"),
      key: "result",
      render: (_, r) => (
        <Tag color={REASON_COLOR[r.reason] ?? "default"}>
          {t(`reason.${r.reason}`)}
        </Tag>
      ),
    },
    { title: t("Ip"), dataIndex: "ip", render: (ip) => <Ip ip={ip} /> },
    {
      title: t("Device"),
      key: "device",
      render: (_, r) => <DeviceCell device={r.device} />,
    },
  ];

  const stat = (key, value, active) => (
    <button
      type="button"
      className={`sec-stat sec-stat--btn ${active ? "is-active" : ""}`}
      onClick={() =>
        key && set({ result: filters.result === key ? "all" : key })
      }
    >
      <span>{t(`log.${key ?? "locked"}`)}</span>
      <b>{value}</b>
    </button>
  );

  return (
    <>
      <Row gutter={[12, 12]} align="bottom" className="mb-3">
        <Col xs={12} md={5}>
          <div className="sec-muted">{t("From")}</div>
          <DayPicker
            value={filters.from}
            max={filters.to}
            onChange={(v) => v && set({ from: v })}
          />
        </Col>
        <Col xs={12} md={5}>
          <div className="sec-muted">{t("To")}</div>
          <DayPicker
            value={filters.to}
            min={filters.from}
            onChange={(v) => v && set({ to: v })}
          />
        </Col>
        <Col xs={24} md={6}>
          <div className="sec-muted">{t("User")}</div>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: "100%" }}
            value={filters.userId ?? undefined}
            onChange={(v) => set({ userId: v ?? null })}
            options={users.map((u) => ({
              value: u.id,
              label: `${locale === "ar" ? u.arFullname : u.enFullname} (${u.username})`,
            }))}
          />
        </Col>
        <Col xs={12} md={4}>
          <div className="sec-muted">{t("Result")}</div>
          <Select
            style={{ width: "100%" }}
            value={filters.result}
            onChange={(v) => set({ result: v })}
            options={RESULTS.map((r) => ({ value: r, label: t(`log.${r}`) }))}
          />
        </Col>
        <Col xs={12} md={4}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => load()}
            loading={loading}
          >
            {t("Refresh")}
          </Button>
        </Col>
      </Row>

      <div className="sec-toolbar">
        {stat("all", data.total, filters.result === "all")}
        {stat("success", data.success, filters.result === "success")}
        {stat("failed", data.failed, filters.result === "failed")}
        <div className="sec-stat">
          <span>{t("log.locked")}</span>
          <b>{data.locked}</b>
        </div>
      </div>

      {data.truncated && (
        <Alert
          type="info"
          showIcon
          className="mb-3"
          title={t("LogTruncated")}
        />
      )}

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={data.rows}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        scroll={{ x: "max-content" }}
      />
    </>
  );
}
