"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Descriptions,
  Modal,
  Skeleton,
  Space,
  Table,
  Tag,
} from "antd";
import { FilePdfOutlined, PrinterOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PrintDocument from "@/components/printing/PrintDocument";
import PdfDocument from "@/components/printing/PdfDocument";
import { getLaundryOrderAction } from "@/actions/laundry-order.actions";
import { formatDateTime, formatDay } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import { C } from "@/lib/theme";
import LaundryReceipt from "./LaundryReceipt";
import { ORDER_COLORS } from "./orderColors";
import "@/components/common/table.css";

// ============================================================
// تفاصيل الطلب: البيانات + السطور + إعادة طباعة الإيصال
// ============================================================
export default function LaundryOrderDetails({ id, printSettings, onClose }) {
  const t = useTranslations("Laundry");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nm = (x, ar = "arName", en = "enName") =>
    locale === "ar" ? x[ar] || x[en] : x[en] || x[ar];
  const [order, setOrder] = useState(null);
  // onClose بيتبعت جديد مع كل رسم للأب، فمنحطوش في الـ deps
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getLaundryOrderAction(id);
      if (!alive) return;
      if (!res.success) {
        showActionError(res, tAlerts, locale);
        return closeRef.current();
      }
      setOrder(res.data);
    })();
    return () => {
      alive = false;
    };
  }, [id, tAlerts, locale]);

  const user = (u) => (u ? (locale === "ar" ? u.arFullname : u.enFullname) : "—");
  // "print" | "pdf" | null
  const [job, setJob] = useState(null);
  const receipt = order && (
    <LaundryReceipt
      order={order}
      paperSize={printSettings.paperSize}
      lang={printSettings.language}
    />
  );

  return (
    <Modal
      open
      width={820}
      footer={null}
      onCancel={onClose}
      title={
        order
          ? t("OrderTitleN", { n: order.dailyNo, day: formatDay(order.bizDay) })
          : t("OrderNo")
      }
      destroyOnHidden
    >
      {!order ? (
        <Skeleton active />
      ) : (
        <>
          <Descriptions
            size="small"
            bordered
            column={{ xs: 1, sm: 2 }}
            className="mb-3"
            items={[
              { key: "c", label: t("Customer"), children: order.customerName },
              {
                key: "p",
                label: t("Phone"),
                children: <bdi>{order.phone}</bdi>,
              },
              {
                key: "s",
                label: t("Status"),
                children: (
                  <span>
                    <Tag color={ORDER_COLORS[order.status]}>
                      {t(`Status_${order.status}`)}
                    </Tag>
                    {order.isUrgent && (
                      <Tag color={C.warning}>{t("Urgent")}</Tag>
                    )}
                  </span>
                ),
              },
              {
                key: "i",
                label: t("Invoice"),
                children: order.sale ? (
                  <bdi>{saleDocNo(order.sale.type, order.sale.number, order.sale.docCode)}</bdi>
                ) : (
                  t("NotInvoiced")
                ),
              },
              {
                key: "r",
                label: t("ReceivedAt"),
                children: <bdi>{formatDateTime(order.createdAt)}</bdi>,
              },
              {
                key: "u",
                label: t("ReceivedBy"),
                children: user(order.createdBy),
              },
              order.readyAt && {
                key: "ra",
                label: t("ReadyAt"),
                children: <bdi>{formatDateTime(order.readyAt)}</bdi>,
              },
              order.cancelledAt && {
                key: "ca",
                label: t("CancelledAt"),
                children: (
                  <span>
                    <bdi>{formatDateTime(order.cancelledAt)}</bdi>
                    {order.cancelReason && ` — ${order.cancelReason}`}
                  </span>
                ),
              },
              order.notes && {
                key: "n",
                label: t("OrderNotes"),
                children: order.notes,
                span: 2,
              },
            ].filter(Boolean)}
          />

          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={order.items}
            scroll={{ x: 560 }}
            className="mb-3"
            columns={[
              { title: t("Qty"), dataIndex: "qty", width: 70 },
              {
                title: t("Item"),
                render: (_, i) => (
                  <span>
                    <b>{nm(i)}</b> - {nm(i, "serviceArName", "serviceEnName")}
                    {i.isUrgent && (
                      <Tag color={C.warning} className="ms-1">
                        {t("Urgent")}
                      </Tag>
                    )}
                    {(i.addons.length > 0 || i.notes) && (
                      <div style={{ color: C.muted, fontSize: 12 }}>
                        {[...i.addons.map((a) => nm(a)), i.notes]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                    )}
                  </span>
                ),
              },
              {
                title: t("Price"),
                width: 100,
                render: (_, i) => <bdi>{money(i.price)}</bdi>,
              },
              {
                title: t("Total"),
                width: 110,
                render: (_, i) => <bdi>{money(i.total)}</bdi>,
              },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <b>{order.totalQty}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} colSpan={2}>
                  <b>{t("Total")}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2}>
                  <b>
                    <bdi>{money(order.totalAmount)}</bdi>
                  </b>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />

          {/* الإيصال حراري بس: طباعة أو PDF */}
          <Space wrap>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              loading={job === "print"}
              disabled={Boolean(job)}
              onClick={() => setJob("print")}
            >
              {t("PrintReceipt")}
            </Button>
            <Button
              danger
              icon={<FilePdfOutlined />}
              loading={job === "pdf"}
              disabled={Boolean(job)}
              onClick={() => setJob("pdf")}
            >
              {t("ReceiptPdf")}
            </Button>
          </Space>
        </>
      )}
      {order && job === "print" && (
        <PrintDocument
          paperSize={printSettings.paperSize}
          onDone={() => setJob(null)}
        >
          {receipt}
        </PrintDocument>
      )}
      {order && job === "pdf" && (
        <PdfDocument
          paperSize={printSettings.paperSize}
          fileName={`laundry-${order.bizDay}-${order.dailyNo}`}
          onDone={() => setJob(null)}
        >
          {receipt}
        </PdfDocument>
      )}
    </Modal>
  );
}
