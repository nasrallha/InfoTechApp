"use client";

import { useState } from "react";
import { Button, Segmented, Space, Table, Tag } from "antd";
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
  ended: "default",
  terminated: "red",
};

// ============================================================
// عقود الإيجار: سارية / منتهية / خروج مبكر / الكل + بحث
// (رقم العقد / رقم إيجار / المستأجر / جواله / الوحدة / العقار)
// ============================================================
export default function ContractsList({ data, filters, canCreate }) {
  const t = useTranslations("RealEstate");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { amount: money } = useCurrency();
  const [search, setSearch] = useState(filters.q ?? "");
  const nameOf = (c) => (locale === "ar" ? c.arName : c.enName || c.arName);
  const now = today();

  const go = (patch) => {
    const f = { ...filters, page: 1, ...patch };
    const q = new URLSearchParams();
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
        <Link href={`/real-estate/contracts/${r.id}`}>
          <b>
            <bdi>{v}</bdi>
          </b>
        </Link>
      ),
    },
    { title: t("EjarNo"), dataIndex: "ejarNo", width: 130, render: (v) => (v ? <bdi>{v}</bdi> : "—") },
    {
      title: t("Tenant"),
      key: "c",
      width: 200,
      render: (_, r) => (
        <div>
          <div className="font-bold">{nameOf(r.customer)}</div>
          {r.customer.phone && (
            <div className="text-xs text-slate-500">
              <bdi>{r.customer.phone}</bdi>
            </div>
          )}
        </div>
      ),
    },
    {
      title: t("Units"),
      key: "u",
      width: 220,
      render: (_, r) =>
        r.units.map((x) => `${x.unit.property.name} - ${t(`kind_${x.unit.kind}`)} ${x.unit.unitNo}`).join("، "),
    },
    {
      title: t("Period"),
      key: "p",
      width: 190,
      render: (_, r) => (
        <bdi>
          {formatDay(r.startDate)} - {formatDay(r.endDate)}
        </bdi>
      ),
    },
    { title: t("PayEvery"), dataIndex: "payEvery", width: 110, align: "center", render: (v) => t(`every_${v}`) },
    { title: t("ContractTotal"), dataIndex: "totalAmount", width: 120, align: "end", render: (v) => money(v) },
    {
      title: t("NextDue"),
      key: "n",
      width: 150,
      render: (_, r) =>
        r.nextDue ? (
          <span style={r.nextDue.date < now ? { color: C.dangerText } : undefined}>
            <bdi>{formatDay(r.nextDue.date)}</bdi> - {money(r.nextDue.amount)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      title: t("Status"),
      dataIndex: "status",
      width: 110,
      align: "center",
      render: (v) => <Tag color={CONTRACT_STATUS_COLOR[v]}>{t(`cstatus_${v}`)}</Tag>,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("ContractsTitle")}
        extra={
          canCreate ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/real-estate/contracts/new")}>
              {t("NewContract")}
            </Button>
          ) : null
        }
      />
      <div className="cp-filters mb-3">
        <Space wrap>
          <Segmented
            value={filters.status}
            onChange={(v) => go({ status: v })}
            options={["active", "ended", "terminated", "all"].map((s) => ({
              value: s,
              label: t(`cstatus_${s}`),
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
