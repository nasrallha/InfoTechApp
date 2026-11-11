"use client";

import { useEffect, useState } from "react";
import { Empty, Modal, Table, Tag, Tooltip } from "antd";
import { message } from "@/components/common/feedback";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { getItemCardAction } from "@/actions/inventory.actions";
import UnitBreakdown from "./UnitBreakdown";
import "@/components/common/table.css";

// لون كل نوع حركة
export const MOVEMENT_COLOR = {
  opening: "default",
  purchase: "green",
  purchase_return: "orange",
  transfer_out: "volcano",
  transfer_in: "cyan",
  count: "purple",
  sale: "blue",
  sale_return: "magenta",
  damage: "red",
  surplus: "lime",
};

// رابط المستند صاحب الحركة
export const refLink = (m) => {
  if (m.refType === "purchase")
    return m.type === "purchase_return"
      ? `/invoices/purchase-returns/${m.refId}`
      : `/invoices/purchases/${m.refId}`;
  if (m.refType === "sale")
    return m.type === "sale_return"
      ? `/invoices/sales-returns/${m.refId}`
      : `/invoices/sales/${m.refId}`;
  if (m.refType === "transfer") return `/inventory/transfers/${m.refId}`;
  if (m.refType === "count") return `/inventory/counts/${m.refId}`;
  if (m.refType === "adjustment") return `/inventory/adjustments/${m.refId}`;
  return null;
};

const qty = (v) => Number(Number(v).toFixed(3));

// ============================================================
// كارت الصنف: كل حركات الصنف (دخول/خروج) والرصيد بعد كل حركة
// product: { id, arName, enName } ، warehouseId: مستودع معيّن أو الكل
// ============================================================
export default function ItemCard({ product, warehouseId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const locale = useLocale();
  const t = useTranslations("Inventory");
  const tAlerts = useTranslations("Alerts");
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  useEffect(() => {
    if (!product) return;
    let active = true;
    setLoading(true);
    setData(null);
    getItemCardAction({ productId: product.id, warehouseId }).then((res) => {
      if (!active) return;
      setLoading(false);
      if (!res.success) return message.error(tAlerts(res.error));
      setData(res.data);
    });
    return () => {
      active = false;
    };
  }, [product, warehouseId, tAlerts]);

  // الأحدث أولاً في العرض (الرصيد محسوب بالترتيب الزمني)
  const rows = data ? [...data.rows].reverse() : [];

  // الرصيد الحالي = الرصيد بعد آخر حركة
  const current = data?.rows.length
    ? data.rows[data.rows.length - 1].balance
    : 0;

  const columns = [
    {
      title: t("Date"),
      key: "date",
      width: 150,
      render: (_, m) => <bdi>{formatDateTime(m.date)}</bdi>,
    },
    {
      title: t("MovementType"),
      key: "type",
      width: 130,
      render: (_, m) => (
        <Tag color={MOVEMENT_COLOR[m.type]}>{t(`Movement.${m.type}`)}</Tag>
      ),
    },
    {
      title: t("Document"),
      key: "ref",
      width: 100,
      render: (_, m) => {
        const href = refLink(m);
        const text = <bdi>{m.refNo ?? "—"}</bdi>;
        return href && m.refNo ? (
          <Link href={href} onClick={onClose}>
            {text}
          </Link>
        ) : (
          text
        );
      },
    },
    {
      title: t("Warehouse"),
      key: "warehouse",
      width: 140,
      render: (_, m) => nameOf(m.warehouse),
    },
    {
      title: t("In"),
      key: "in",
      width: 90,
      render: (_, m) =>
        m.qty > 0 ? <span className="text-green-700">{qty(m.qty)}</span> : "",
    },
    {
      title: t("Out"),
      key: "out",
      width: 90,
      render: (_, m) =>
        m.qty < 0 ? <span className="text-red-600">{qty(-m.qty)}</span> : "",
    },
    {
      title: t("Balance"),
      key: "balance",
      width: 100,
      render: (_, m) => (
        <Tooltip
          title={
            data?.product.units.length > 1 ? (
              <UnitBreakdown qty={m.balance} units={data.product.units} />
            ) : null
          }
        >
          <b className={m.balance < 0 ? "text-red-600" : undefined}>
            {qty(m.balance)}
          </b>
        </Tooltip>
      ),
    },
  ];

  return (
    <Modal
      open={Boolean(product)}
      onCancel={onClose}
      footer={null}
      width={960}
      centered
      title={
        product ? (
          <span>
            {t("ItemCard")}: {nameOf(product)}{" "}
            {data?.product?.baseUnit && (
              <Tag>{nameOf(data.product.baseUnit)}</Tag>
            )}
          </span>
        ) : null
      }
      destroyOnHidden
    >
      {data && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-gray-500">{t("CurrentBalance")}:</span>
          <b className={current < 0 ? "text-red-600" : undefined}>
            {qty(current)} {nameOf(data.product.baseUnit)}
          </b>
          <UnitBreakdown qty={current} units={data.product.units} />
        </div>
      )}
      <Table
        bordered
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        tableLayout="fixed"
        scroll={{ x: 800, y: 480 }}
        locale={{ emptyText: <Empty description={t("NoMovements")} /> }}
        pagination={{
          pageSize: 50,
          showSizeChanger: false,
          hideOnSinglePage: true,
        }}
      />
    </Modal>
  );
}
