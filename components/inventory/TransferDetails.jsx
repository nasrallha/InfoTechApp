"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  InputNumber,
  Popconfirm,
  Space,
  Table,
  Tag,
} from "antd";
import { message } from "@/components/common/feedback";
import {
  ArrowRightOutlined,
  CheckOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import {
  cancelTransferAction,
  receiveTransferAction,
} from "@/actions/inventory.actions";
import { showActionError } from "@/components/common/actionError";
import PrintDocument from "@/components/printing/PrintDocument";
import StockDocument from "./StockDocument";
import { TRANSFER_STATUS_COLOR } from "./TransfersList";
import { C } from "@/lib/theme";
import "@/components/common/table.css";

const q3 = (v) => (v == null ? "" : Number(Number(v).toFixed(3)));

// ============================================================
// عرض تحويل مخزني
// - "في الطريق": المستودع المستلِم يستلم (يقدر يعدّل الكمية المستلمة فعلاً)
//   أو المستودع المُرسِل يلغي (البضاعة ترجع له)
// - المستلَم: الكمية المرسلة والمستلمة والعجز
// ============================================================
export default function TransferDetails({
  transfer,
  company,
  canReceive,
  canCancel,
  canCreate,
}) {
  const [receiving, setReceiving] = useState(false);
  const [received, setReceived] = useState({});
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Inventory");
  const tAlerts = useTranslations("Alerts");
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const userName = (u) =>
    u ? (locale === "ar" ? u.arFullname : u.enFullname) : "";

  const pending = transfer.status === "sent";
  const no = formatDocNo("transfer", transfer.number);
  const showReceive = pending && canReceive && transfer.canReceiveHere;
  const showCancel = pending && canCancel && transfer.canCancelHere;
  const isReceived = transfer.status === "received";

  const receivedOf = (it) => received[it.id] ?? it.qty;

  const confirmReceive = async () => {
    setBusy(true);
    const res = await receiveTransferAction({
      id: transfer.id,
      items: transfer.items.map((it) => ({
        itemId: it.id,
        receivedQty: receivedOf(it),
      })),
    });
    setBusy(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("TransferReceived", { number: no }));
    setReceiving(false);
    setReceived({});
  };

  const cancel = async () => {
    setBusy(true);
    const res = await cancelTransferAction(transfer.id);
    setBusy(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("TransferCancelled", { number: no }));
  };

  const columns = [
    { title: "#", key: "i", width: 50, render: (_, __, i) => i + 1 },
    {
      title: t("Item"),
      key: "item",
      width: 240,
      render: (_, it) => (
        <div>
          <div style={{ fontWeight: 600 }}>{nameOf(it)}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            <bdi>{it.code}</bdi>
          </div>
        </div>
      ),
    },
    {
      title: t("Unit"),
      key: "unit",
      width: 110,
      render: (_, it) => nameOf(it.unit),
    },
    {
      title: t("SentQty"),
      key: "qty",
      width: 110,
      render: (_, it) => q3(it.qty),
    },
    (receiving || isReceived) && {
      title: t("ReceivedQty"),
      key: "received",
      width: 140,
      render: (_, it) =>
        receiving ? (
          <InputNumber
            style={{ width: "100%" }}
            min={0}
            max={it.qty}
            precision={3}
            controls={false}
            value={receivedOf(it)}
            onFocus={(e) => e.target.select()}
            formatter={(v) => (v === "" || v == null ? "" : String(Number(v)))}
            onChange={(v) =>
              setReceived((prev) => ({ ...prev, [it.id]: v ?? 0 }))
            }
          />
        ) : (
          q3(it.receivedQty)
        ),
    },
    (receiving || isReceived) && {
      title: t("Shortage"),
      key: "short",
      width: 100,
      render: (_, it) => {
        const got = receiving ? receivedOf(it) : it.receivedQty;
        const diff = Number((it.qty - (got ?? 0)).toFixed(3));
        return diff > 0 ? <b className="text-red-600">{diff}</b> : "—";
      },
    },
  ].filter(Boolean);
  const width = columns.reduce((s, c) => s + c.width, 0);

  const L = (key) => t(key);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          {t("Transfer")} <bdi>{no}</bdi>{" "}
          <Tag color={TRANSFER_STATUS_COLOR[transfer.status]}>
            {t(`TransferStatus.${transfer.status}`)}
          </Tag>
        </h1>
        <Space wrap>
          {showReceive && !receiving && (
            <Button
              type="primary"
              size="large"
              icon={<DownloadOutlined />}
              onClick={() => setReceiving(true)}
            >
              {t("Receive")}
            </Button>
          )}
          {receiving && (
            <>
              <Popconfirm
                title={t("ConfirmReceive")}
                onConfirm={confirmReceive}
              >
                <Button
                  type="primary"
                  size="large"
                  icon={<CheckOutlined />}
                  loading={busy}
                >
                  {t("ConfirmReceiveBtn")}
                </Button>
              </Popconfirm>
              <Button
                size="large"
                onClick={() => {
                  setReceiving(false);
                  setReceived({});
                }}
              >
                {t("Back")}
              </Button>
            </>
          )}
          {showCancel && !receiving && (
            <Popconfirm title={t("ConfirmCancelTransfer")} onConfirm={cancel}>
              <Button
                danger
                size="large"
                icon={<CloseCircleOutlined />}
                loading={busy}
              >
                {t("CancelTransfer")}
              </Button>
            </Popconfirm>
          )}
          <Button
            size="large"
            icon={<PrinterOutlined />}
            onClick={() => setPrinting(true)}
          >
            {t("Print")}
          </Button>
          {canCreate && (
            <Link href="/inventory/transfers/new">
              <Button size="large">{t("NewTransfer")}</Button>
            </Link>
          )}
          <Button
            size="large"
            icon={<ArrowRightOutlined />}
            onClick={() => router.push("/inventory/transfers")}
          >
            {t("BackToList")}
          </Button>
        </Space>
      </div>

      {pending && (
        <Alert
          type="warning"
          showIcon
          className="mb-3"
          title={receiving ? t("ReceiveHint") : t("InTransitHint")}
        />
      )}

      <Card size="small" className="mb-3">
        <Descriptions
          size="small"
          column={{ xs: 1, md: 3 }}
          items={[
            {
              key: "from",
              label: L("FromWarehouse"),
              children: nameOf(transfer.fromWarehouse),
            },
            {
              key: "to",
              label: L("ToWarehouse"),
              children: nameOf(transfer.toWarehouse),
            },
            {
              key: "date",
              label: L("Date"),
              children: <bdi>{formatDateTime(transfer.date)}</bdi>,
            },
            {
              key: "by",
              label: L("SentBy"),
              children: userName(transfer.createdBy),
            },
            transfer.receivedAt && {
              key: "recAt",
              label: L("ReceivedAt"),
              children: <bdi>{formatDateTime(transfer.receivedAt)}</bdi>,
            },
            transfer.receivedBy && {
              key: "recBy",
              label: L("ReceivedBy"),
              children: userName(transfer.receivedBy),
            },
            transfer.notes && {
              key: "notes",
              label: L("Notes"),
              children: transfer.notes,
            },
          ].filter(Boolean)}
        />
      </Card>

      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={transfer.items}
        tableLayout="fixed"
        scroll={{ x: width }}
        pagination={false}
      />

      {printing && (
        <PrintDocument paperSize="A4" onDone={() => setPrinting(false)}>
          <StockDocument
            company={company}
            dir={locale === "ar" ? "rtl" : "ltr"}
            title={`${t("TransferNote")} ${no}`}
            meta={[
              {
                label: L("FromWarehouse"),
                value: nameOf(transfer.fromWarehouse),
              },
              { label: L("ToWarehouse"), value: nameOf(transfer.toWarehouse) },
              {
                label: L("Date"),
                value: <bdi>{formatDateTime(transfer.date)}</bdi>,
              },
              {
                label: L("Status"),
                value: t(`TransferStatus.${transfer.status}`),
              },
              { label: L("Notes"), value: transfer.notes },
            ]}
            columns={[
              { title: "#", render: (_, i) => i + 1 },
              { title: L("Code"), render: (it) => <bdi>{it.code}</bdi> },
              { title: L("Item"), name: true, render: (it) => nameOf(it) },
              { title: L("Unit"), render: (it) => nameOf(it.unit) },
              { title: L("SentQty"), render: (it) => q3(it.qty) },
              ...(isReceived
                ? [
                    {
                      title: L("ReceivedQty"),
                      render: (it) => q3(it.receivedQty),
                    },
                  ]
                : []),
            ]}
            rows={transfer.items}
            signatures={[L("Sender"), L("Driver"), L("Receiver")]}
          />
        </PrintDocument>
      )}
    </div>
  );
}
