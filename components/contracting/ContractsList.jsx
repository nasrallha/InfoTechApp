"use client";

import { useState } from "react";
import { Button, Progress, Segmented, Space, Table, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import PageHeader from "@/components/common/PageHeader";
import SearchBox from "@/components/common/SearchBox";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { formatDay, today } from "@/lib/dates";
import { C } from "@/lib/theme";

export const CONTRACT_STATUS_COLOR = {
  active: "green",
  completed: "blue",
  cancelled: "red",
};

// ============================================================
// عقود المقاولات: مع المالك / مقاولي الباطن + الحالة + بحث
// (رقم العقد / المشروع / رقم العقد عند الطرف / الطرف / جواله)
// ============================================================
export default function ContractsList({ data, filters, canCreate }) {
  const t = useTranslations("Contracting");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { amount: money } = useCurrency();
  const [search, setSearch] = useState(filters.q ?? "");
  const nameOf = (c) => (c ? (locale === "ar" ? c.arName : c.enName || c.arName) : "—");
  const now = today();
  const sub = filters.kind === "sub";

  const go = (patch) => {
    const f = { ...filters, page: 1, ...patch };
    const q = new URLSearchParams();
    if (f.kind && f.kind !== "owner") q.set("kind", f.kind);
    if (f.status && f.status !== "active") q.set("status", f.status);
    if (f.q) q.set("q", f.q);
    if (f.page > 1) q.set("page", String(f.page));
    router.push(`${pathname}${q.toString() ? `?${q}` : ""}`);
  };

  const columns = [
    {
      title: t("ContractNo"),
      dataIndex: "docNo",
      width: 120,
      render: (v, r) => (
        <Link href={`/contracting/${r.id}`}>
          <b>
            <bdi>{v}</bdi>
          </b>
        </Link>
      ),
    },
    {
      title: t("Project"),
      dataIndex: "projectName",
      width: 230,
      render: (v, r) => (
        <div>
          <div className="font-bold">{v}</div>
          {r.refNo && (
            <div className="text-xs text-slate-500">
              {t("RefNo")}: <bdi>{r.refNo}</bdi>
            </div>
          )}
        </div>
      ),
    },
    {
      title: sub ? t("Subcontractor") : t("Owner"),
      key: "p",
      width: 200,
      render: (_, r) => (
        <div>
          <div>{nameOf(r.party)}</div>
          {r.party?.phone && (
            <div className="text-xs text-slate-500">
              <bdi>{r.party.phone}</bdi>
            </div>
          )}
        </div>
      ),
    },
    { title: t("SignDate"), dataIndex: "signDate", width: 105, render: (v) => formatDay(v) },
    {
      title: t("EndDate"),
      dataIndex: "endDate",
      width: 105,
      render: (v, r) => (
        <span style={r.status === "active" && v < now ? { color: C.dangerText } : undefined}>{formatDay(v)}</span>
      ),
    },
    { title: t("ContractValue"), dataIndex: "totalAmount", width: 130, align: "end", render: (v) => money(v) },
    {
      title: t("Progress"),
      key: "pr",
      width: 150,
      render: (_, r) => (
        <div>
          <Progress percent={r.progress} size="small" strokeColor={C.success} />
          <div className="text-xs text-slate-500">
            {t("CertificatesN", { n: r.certificates })}
          </div>
        </div>
      ),
    },
    {
      title: t("Status"),
      dataIndex: "status",
      width: 100,
      align: "center",
      render: (v) => <Tag color={CONTRACT_STATUS_COLOR[v]}>{t(`status_${v}`)}</Tag>,
    },
  ];

  return (
    <div>
      <PageHeader
        title={sub ? t("SubContractsTitle") : t("OwnerContractsTitle")}
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push(`/contracting/new?kind=${filters.kind}`)}
            >
              {sub ? t("NewSubContract") : t("NewOwnerContract")}
            </Button>
          ) : null
        }
      />
      <div className="cp-filters mb-3">
        <Space wrap>
          <Segmented
            value={filters.kind}
            onChange={(v) => go({ kind: v })}
            options={["owner", "sub"].map((k) => ({ value: k, label: t(`kind_${k}`) }))}
          />
          <Segmented
            value={filters.status}
            onChange={(v) => go({ status: v })}
            options={["active", "completed", "cancelled", "all"].map((s) => ({
              value: s,
              label: t(`status_${s}`),
            }))}
          />
          <SearchBox
            width={300}
            placeholder={t("SearchContracts")}
            value={search}
            onChange={(v) => {
              setSearch(v);
              if (!v && filters.q) go({ q: "" });
            }}
            onSearch={(v) => go({ q: v.trim() })}
          />
        </Space>
      </div>
      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={data.rows}
        tableLayout="fixed"
        scroll={{ x: columns.reduce((s, c) => s + c.width, 0) }}
        pagination={{
          current: data.page,
          pageSize: data.pageSize,
          total: data.total,
          showSizeChanger: false,
          onChange: (page) => go({ page }),
        }}
        locale={{ emptyText: t("NoContracts") }}
      />
    </div>
  );
}
