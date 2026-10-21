"use client";

import { useState } from "react";
import { Button, Segmented, Space, Table, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import SearchBox from "@/components/common/SearchBox";
import "@/components/common/table.css";

export const TRANSFER_STATUS_COLOR = {
  sent: "gold",
  received: "green",
  cancelled: "default",
};

// ============================================================
// قائمة التحويلات المخزنية (فلتر بالحالة + بحث برقم التحويل)
// المستخدم يرى ما خرج من مستودعه أو دخل إليه
// ============================================================
export default function TransfersList({ data, q, status, canCreate }) {
  const [search, setSearch] = useState(q ?? "");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Inventory");
  const tSidebar = useTranslations("Sidebar");
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const go = (params) => {
    const next = { q: search, status, page: 1, ...params };
    const query = new URLSearchParams();
    if (next.q) query.set("q", next.q);
    if (next.status) query.set("status", next.status);
    if (next.page > 1) query.set("page", String(next.page));
    const qs = query.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const columns = [
    {
      title: t("TransferNo"),
      key: "number",
      width: 110,
      render: (_, r) => (
        <Link href={`/inventory/transfers/${r.id}`}>
          <b>
            <bdi>{formatDocNo("transfer", r.number)}</bdi>
          </b>
        </Link>
      ),
    },
    {
      title: t("Date"),
      key: "date",
      width: 150,
      render: (_, r) => <bdi>{formatDateTime(r.date)}</bdi>,
    },
    {
      title: t("FromWarehouse"),
      key: "from",
      width: 170,
      render: (_, r) => nameOf(r.fromWarehouse),
    },
    {
      title: t("ToWarehouse"),
      key: "to",
      width: 170,
      render: (_, r) => nameOf(r.toWarehouse),
    },
    {
      title: t("ItemsCount"),
      key: "items",
      width: 90,
      render: (_, r) => r._count.items,
    },
    {
      title: t("Status"),
      key: "status",
      width: 120,
      render: (_, r) => (
        <Tag color={TRANSFER_STATUS_COLOR[r.status]}>
          {t(`TransferStatus.${r.status}`)}
        </Tag>
      ),
    },
    {
      title: t("ReceivedAt"),
      key: "receivedAt",
      width: 150,
      render: (_, r) =>
        r.receivedAt ? <bdi>{formatDateTime(r.receivedAt)}</bdi> : "—",
    },
  ];
  const width = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{tSidebar("Transfers")}</h1>
        {canCreate && (
          <Link href="/inventory/transfers/new">
            <Button type="primary" size="large" icon={<PlusOutlined />}>
              {t("NewTransfer")}
            </Button>
          </Link>
        )}
      </div>

      <Space wrap className="mb-3">
        <SearchBox
          width={260}
          placeholder={t("SearchTransferNo")}
          value={search}
          onChange={setSearch}
          onSearch={(v) => go({ q: v })}
        />
        <Segmented
          value={status ?? "all"}
          onChange={(v) => go({ status: v === "all" ? undefined : v })}
          options={[
            { value: "all", label: t("All") },
            { value: "sent", label: t("TransferStatus.sent") },
            { value: "received", label: t("TransferStatus.received") },
            { value: "cancelled", label: t("TransferStatus.cancelled") },
          ]}
        />
      </Space>

      <Table
        bordered
        size="small"
        rowKey="id"
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
