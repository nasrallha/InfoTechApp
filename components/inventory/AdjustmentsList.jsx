"use client";

import { useState } from "react";
import { Button, Space, Table, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import { useCurrency } from "@/components/common/CurrencyProvider";
import SearchBox from "@/components/common/SearchBox";
import StatusFilters from "@/components/common/StatusFilters";
import { C } from "@/lib/theme";
import "@/components/common/status-colors.css";
import "@/components/common/table.css";

// لون كل نوع (الفلاتر، الصفوف، العلامة)
export const ADJUSTMENT_COLORS = {
  damage: C.danger,
  surplus: C.success,
  all: C.info,
  cancelled: C.muted,
};

// ============================================================
// قائمة التوالف والزيادات (فلتر بالنوع + بحث بالرقم)
// ============================================================
export default function AdjustmentsList({ data, q, type, canCreate }) {
  const [search, setSearch] = useState(q ?? "");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Adjustments");
  const tI = useTranslations("Inventory");
  const { amount: money } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const userName = (u) =>
    u ? (locale === "ar" ? u.arFullname : u.enFullname) : "";

  const go = (params) => {
    const next = { q: search, type, page: 1, ...params };
    const query = new URLSearchParams();
    if (next.q) query.set("q", next.q);
    if (next.type) query.set("type", next.type);
    if (next.page > 1) query.set("page", String(next.page));
    const qs = query.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const colorOf = (r) =>
    r.status === "cancelled"
      ? ADJUSTMENT_COLORS.cancelled
      : ADJUSTMENT_COLORS[r.type];

  const columns = [
    {
      title: t("Number"),
      key: "number",
      width: 100,
      render: (_, r) => (
        <Link href={`/inventory/adjustments/${r.id}`}>
          <b>
            <bdi>{formatDocNo("adjustment", r.number, r.docCode)}</bdi>
          </b>
        </Link>
      ),
    },
    {
      title: t("Type"),
      key: "type",
      width: 100,
      render: (_, r) => (
        <Tag color={ADJUSTMENT_COLORS[r.type]}>{t(`Type_${r.type}`)}</Tag>
      ),
    },
    {
      title: tI("Date"),
      key: "date",
      width: 150,
      render: (_, r) => <bdi>{formatDateTime(r.date)}</bdi>,
    },
    {
      title: tI("Warehouse"),
      key: "wh",
      width: 160,
      render: (_, r) => nameOf(r.warehouse),
    },
    {
      title: tI("ItemsCount"),
      key: "items",
      width: 90,
      render: (_, r) => r._count.items,
    },
    {
      title: t("Value"),
      key: "value",
      width: 130,
      align: "end",
      render: (_, r) => <b style={{ color: colorOf(r) }}>{money(r.value)}</b>,
    },
    {
      title: t("CreatedBy"),
      key: "by",
      width: 140,
      render: (_, r) => userName(r.createdBy),
    },
    {
      title: tI("Status"),
      key: "status",
      width: 100,
      render: (_, r) =>
        r.status === "cancelled" ? (
          <Tag>{t("Cancelled")}</Tag>
        ) : (
          <Tag color="blue">{t("Posted")}</Tag>
        ),
    },
  ];
  const width = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{t("Title")}</h1>
        {canCreate && (
          <Space>
            <Link href="/inventory/adjustments/new?type=damage">
              <Button
                danger
                type="primary"
                size="large"
                icon={<PlusOutlined />}
              >
                {t("NewDamage")}
              </Button>
            </Link>
            <Link href="/inventory/adjustments/new?type=surplus">
              <Button
                size="large"
                icon={<PlusOutlined />}
                style={{ background: C.success, color: "#fff", border: 0 }}
              >
                {t("NewSurplus")}
              </Button>
            </Link>
          </Space>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center mb-3">
        <StatusFilters
          value={type ?? "all"}
          onChange={(v) => go({ type: v === "all" ? undefined : v })}
          options={["all", "damage", "surplus"].map((k) => ({
            value: k,
            label: t(`Filter_${k}`),
            color: ADJUSTMENT_COLORS[k],
            count: data.counts?.[k] ?? 0,
          }))}
        />
        <SearchBox
          width={240}
          placeholder={t("SearchNo")}
          value={search}
          onChange={setSearch}
          onSearch={(v) => go({ q: v })}
        />
      </div>

      <Table
        className="sc-table"
        bordered
        size="small"
        rowKey="id"
        rowClassName={() => "sc-row"}
        onRow={(r) => ({
          onClick: () => router.push(`/inventory/adjustments/${r.id}`),
          style: { cursor: "pointer", "--c": colorOf(r) },
        })}
        columns={columns}
        dataSource={data.rows}
        tableLayout="fixed"
        scroll={{ x: width }}
        pagination={{
          current: data.page,
          pageSize: data.pageSize,
          total: data.total,
          showSizeChanger: false,
          onChange: (page) => go({ page }),
        }}
      />
    </div>
  );
}
