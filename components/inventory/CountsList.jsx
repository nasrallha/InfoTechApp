"use client";

import { Button, Table, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import "@/components/common/table.css";

export const COUNT_STATUS_COLOR = { draft: "gold", posted: "green" };

// قائمة الجرد (المسودات والمرحّلة)
export default function CountsList({ data, canCreate }) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Inventory");
  const tSidebar = useTranslations("Sidebar");
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const columns = [
    {
      title: t("CountNo"),
      key: "number",
      width: 110,
      render: (_, r) => (
        <Link href={`/inventory/counts/${r.id}`}>
          <b>
            <bdi>{formatDocNo("count", r.number)}</bdi>
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
      title: t("Warehouse"),
      key: "warehouse",
      width: 180,
      render: (_, r) => nameOf(r.warehouse),
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
      width: 110,
      render: (_, r) => (
        <Tag color={COUNT_STATUS_COLOR[r.status]}>
          {t(`CountStatus.${r.status}`)}
        </Tag>
      ),
    },
    {
      title: t("PostedAt"),
      key: "postedAt",
      width: 150,
      render: (_, r) =>
        r.postedAt ? <bdi>{formatDateTime(r.postedAt)}</bdi> : "—",
    },
  ];
  const width = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{tSidebar("InventoryCounts")}</h1>
        {canCreate && (
          <Link href="/inventory/counts/new">
            <Button type="primary" size="large" icon={<PlusOutlined />}>
              {t("NewCount")}
            </Button>
          </Link>
        )}
      </div>

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
          onChange: (page) =>
            router.push(page > 1 ? `${pathname}?page=${page}` : pathname),
        }}
      />
    </div>
  );
}
