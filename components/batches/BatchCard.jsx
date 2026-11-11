"use client";

import { useEffect, useState } from "react";
import { Descriptions, Empty, Modal, Table, Tag } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { formatDay } from "@/lib/dates";
import { qtyText } from "@/lib/unit-qty";
import { message } from "@/components/common/feedback";
import { batchCardAction } from "@/actions/inventory.actions";
import { MOVEMENT_COLOR, refLink } from "@/components/inventory/ItemCard";
import "@/components/common/table.css";

// ============================================================
// كارت الدفعة: بياناتها وكل حركاتها (وارد / منصرف) والرصيد بعد كل حركة
// batchId: الدفعة المفتوحة (null = مقفول)
// ============================================================
export default function BatchCard({ batchId, onClose }) {
  const t = useTranslations("BatchesReport");
  const tInv = useTranslations("Inventory");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!batchId) return;
    let active = true;
    batchCardAction({ batchId }).then((res) => {
      if (!active) return;
      if (!res.success) return message.error(tAlerts(res.error));
      setData(res.data);
    });
    return () => {
      active = false;
      setData(null);
    };
  }, [batchId, tAlerts]);

  const columns = [
    {
      title: t("MoveDate"),
      key: "date",
      width: 110,
      render: (_, m) => <bdi>{formatDay(m.date)}</bdi>,
    },
    {
      title: t("MoveType"),
      key: "type",
      width: 130,
      render: (_, m) => (
        <Tag color={MOVEMENT_COLOR[m.moveType]}>
          {tInv(`Movement.${m.moveType}`)}
        </Tag>
      ),
    },
    {
      title: t("Document"),
      key: "ref",
      width: 120,
      render: (_, m) => {
        const href = refLink({ ...m, type: m.moveType });
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
      title: t("In"),
      key: "in",
      width: 90,
      align: "center",
      render: (_, m) => (m.qty > 0 ? qtyText(m.qty) : ""),
    },
    {
      title: t("Out"),
      key: "out",
      width: 90,
      align: "center",
      render: (_, m) => (m.qty < 0 ? qtyText(-m.qty) : ""),
    },
    {
      title: t("Balance"),
      key: "balance",
      width: 90,
      align: "center",
      render: (_, m) => <b>{qtyText(m.balance)}</b>,
    },
  ];
  const width = columns.reduce((s, c) => s + c.width, 0);

  return (
    <Modal
      open={!!batchId}
      onCancel={onClose}
      footer={null}
      width={760}
      title={t("CardTitle")}
      destroyOnHidden
    >
      {data && (
        <Descriptions
          size="small"
          bordered
          className="mb-3"
          column={{ xs: 1, sm: 2 }}
          items={[
            { key: "item", label: t("Item"), children: nameOf(data.product) },
            {
              key: "no",
              label: t("BatchNo"),
              children: (
                <bdi>{data.batchNo === "-" ? t("NoBatch") : data.batchNo}</bdi>
              ),
            },
            {
              key: "wh",
              label: t("Warehouse"),
              children: nameOf(data.warehouse),
            },
            { key: "qty", label: t("Qty"), children: qtyText(data.qty) },
            {
              key: "mfg",
              label: t("MfgDate"),
              children: data.mfgDate ? <bdi>{formatDay(data.mfgDate)}</bdi> : "—",
            },
            {
              key: "exp",
              label: t("ExpDate"),
              children: data.expDate ? <bdi>{formatDay(data.expDate)}</bdi> : "—",
            },
          ]}
        />
      )}
      <Table
        bordered
        size="small"
        rowKey="id"
        loading={!data}
        columns={columns}
        dataSource={data ? [...data.moves].reverse() : []}
        scroll={{ x: width }}
        pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty description={t("NoMoves")} /> }}
      />
    </Modal>
  );
}
