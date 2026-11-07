"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Input, Table, Tag } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import StatusFilters from "@/components/common/StatusFilters";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { Link, useRouter } from "@/i18n/routing";
import { formatDocNo } from "@/lib/doc-number";
import { today } from "@/lib/dates";
import { listContractsAction } from "@/actions/technician.actions";
import ContractFormModal from "./ContractFormModal";
import { C } from "@/lib/theme";

// لون كل حالة (الفلاتر، الصفوف، العلامة، رأس صفحة العقد)
export const CONTRACT_COLORS = {
  active: C.success,
  ended: C.muted,
  cancelled: C.danger,
  all: C.info,
};

// ============================================================
// عقود الصيانة الدورية: القايمة + عقد جديد
// ============================================================
export default function ContractsView({ customers = [], technicians = [] }) {
  const t = useTranslations("Contracts");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const can = useCan();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [status, setStatus] = useState("active");
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState({ key: null, rows: [], counts: {} });
  const key = JSON.stringify({ status, q });
  const load = useCallback(
    () => listContractsAction({ status, q }),
    [status, q],
  );
  const todayDay = today();

  useEffect(() => {
    let alive = true;
    load().then((res) => {
      if (!alive) return;
      if (!res.success) showActionError(res, tAlerts, locale);
      setResult((prev) =>
        res.success ? { key, ...res.data } : { ...prev, key },
      );
    });
    return () => {
      alive = false;
    };
  }, [load, key, tAlerts, locale]);

  return (
    <>
      <PageHeader
        title={t("Title")}
        subtitle={t("Subtitle")}
        buttonTitle={can("maintenanceContracts.create") ? t("New") : null}
        onButtonClick={() => setCreating(true)}
      />
      <Card size="small" className="mb-3">
        <StatusFilters
          className="mb-3"
          value={status}
          onChange={setStatus}
          options={["active", "ended", "cancelled", "all"].map((s) => ({
            value: s,
            label: t(`Filter_${s}`),
            color: CONTRACT_COLORS[s],
            count: result.counts?.[s] ?? 0,
          }))}
        />
        <Input.Search
          allowClear
          style={{ maxWidth: 420 }}
          placeholder={t("SearchPlaceholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onSearch={(v) => setQ(v.trim())}
        />
      </Card>

      <Table
        className="sc-table"
        size="small"
        rowKey="id"
        rowClassName={() => "sc-row"}
        loading={result.key !== key}
        dataSource={result.rows}
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        onRow={(r) => ({
          onClick: () => router.push(`/maintenance-contracts/${r.id}`),
          style: { cursor: "pointer", "--c": CONTRACT_COLORS[r.status] },
        })}
        columns={[
          {
            title: t("Number"),
            width: 90,
            render: (_, r) => (
              <Link href={`/maintenance-contracts/${r.id}`}>
                <bdi>{formatDocNo("contract", r.number)}</bdi>
              </Link>
            ),
          },
          {
            title: t("Customer"),
            width: 190,
            render: (_, r) => (
              <span>
                {nm(r.customer)}
                {r.customer?.phone && (
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    <bdi>{r.customer.phone}</bdi>
                  </div>
                )}
              </span>
            ),
          },
          {
            title: t("Device"),
            width: 200,
            render: (_, r) => (
              <span>
                {r.deviceName}
                {r.serialText && (
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    <bdi>{r.serialText}</bdi>
                  </div>
                )}
              </span>
            ),
          },
          {
            title: t("Every"),
            width: 110,
            render: (_, r) => t("EveryN", { n: r.intervalMonths }),
          },
          {
            title: t("Period"),
            width: 190,
            render: (_, r) => (
              <bdi>
                {r.startDate} — {r.endDate}
              </bdi>
            ),
          },
          {
            title: t("NextVisit"),
            width: 130,
            render: (_, r) =>
              r.nextVisit ? (
                <span
                  style={{
                    color: r.nextVisit < todayDay ? C.dangerText : undefined,
                  }}
                >
                  {r.nextVisit < todayDay && <ClockCircleOutlined />}{" "}
                  <bdi>{r.nextVisit}</bdi>
                </span>
              ) : (
                "—"
              ),
          },
          {
            title: t("Technician"),
            width: 120,
            render: (_, r) => nm(r.technician) || "—",
          },
          {
            title: t("Amount"),
            width: 110,
            align: "end",
            render: (_, r) => (r.amount != null ? money(r.amount) : "—"),
          },
          {
            title: t("Status"),
            width: 90,
            render: (_, r) => (
              <Tag color={CONTRACT_COLORS[r.status]}>
                {t(`Status_${r.status}`)}
              </Tag>
            ),
          },
        ]}
      />

      {creating && (
        <ContractFormModal
          customers={customers}
          technicians={technicians}
          onClose={() => setCreating(false)}
          onSaved={(id) => router.push(`/maintenance-contracts/${id}`)}
        />
      )}
    </>
  );
}
