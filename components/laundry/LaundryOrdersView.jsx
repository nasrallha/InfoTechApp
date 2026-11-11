"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Col,
  Input,
  Modal,
  Row,
  Space,
  Table,
  Tag,
} from "antd";
import {
  CarryOutOutlined,
  CloseCircleOutlined,
  EditOutlined,
  EyeOutlined,
  FileDoneOutlined,
  WhatsAppOutlined,
  PlusOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import PageHeader from "@/components/common/PageHeader";
import SearchBox from "@/components/common/SearchBox";
import StatusFilters from "@/components/common/StatusFilters";
import DayPicker from "@/components/common/DayPicker";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useBizToday } from "@/components/common/useBusinessDay";
import {
  cancelLaundryOrderAction,
  deliverLaundryOrdersAction,
  laundryDaySummaryAction,
  listLaundryOrdersAction,
} from "@/actions/laundry-order.actions";
import { formatDateTime, formatDay } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import { C } from "@/lib/theme";
import LaundryOrderDetails from "./LaundryOrderDetails";
import WhatsAppSend, { useWaMessages } from "./WhatsAppSend";
import SaleDocument from "@/components/sales/SaleDocument";
import { useCompany } from "@/components/common/CompanyProvider";
import { getSaleAction } from "@/actions/sale.actions";
import { ORDER_COLORS } from "./orderColors";
import "@/components/common/table.css";

// اللي لسه ما اتسلمش (processing / ready من الطلبات القديمة)
const OPEN = ["received", "processing", "ready"];
const EDITABLE = ["received", "processing"];

// ============================================================
// لوحة طلبات المغسلة (فرع المستخدم)
// - ملخص اليوم: المسجّل والمسلَّم والباقي (الباقي من كل الأيام)
// - البحث بـ Enter: الجوال / رقم الطلب اليومي + يومه / باركود الإيصال / الاسم
// - الفترة (من / إلى) + فلتر الحالة بالأعداد
// - مفيش تغيير حالة يدوي: الطلب اللي اتفوتر (كاش / شبكة / اشتراك) = اتسلم
// - تحديد كذا طلب ← فوترة (فاتورة مجمعة)
// ============================================================
export default function LaundryOrdersView({
  initialQ = "",
  printSettings,
  invoiceSettings,
}) {
  const t = useTranslations("Laundry");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const can = useCan();
  const { amount: money } = useCurrency();
  const today = useBizToday();

  const [q, setQ] = useState(initialQ);
  const [day, setDay] = useState(today);
  const [range, setRange] = useState({ from: null, to: null });
  const [status, setStatus] = useState(initialQ ? "all" : "open");
  // البحث المطبّق (بيتغير بـ Enter أو الزرار)
  const [applied, setApplied] = useState({ q: initialQ, day: today });
  const [data, setData] = useState({ rows: [], counts: {} });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  // إرسال للعميل على واتساب: { phone, text, pdf }
  const [wa, setWa] = useState(null);
  const waMsg = useWaMessages();
  const company = useCompany();
  const [reason, setReason] = useState("");
  const [summaryDay, setSummaryDay] = useState(today);
  const [summary, setSummary] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listLaundryOrdersAction({
      q: applied.q,
      day: applied.day,
      from: range.from,
      to: range.to,
      status,
    });
    setLoading(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    setData(res.data);
    setSelected([]);
  }, [applied, range, status, tAlerts, locale]);

  const loadSummary = useCallback(async () => {
    const res = await laundryDaySummaryAction(summaryDay);
    if (res.success) setSummary(res.data);
  }, [summaryDay]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSummary();
  }, [loadSummary]);

  const refresh = () => {
    load();
    loadSummary();
  };

  const selectedRows = () => data.rows.filter((r) => selected.includes(r.id));

  // الفوترة: الكاشير بالطلبات في السلة (اللي مش مفوترة ولنفس العميل)
  const invoice = (rows) => {
    const list = rows.filter((r) => !r.saleId && r.status !== "cancelled");
    if (!list.length) return message.warning(t("NothingToInvoice"));
    if (new Set(list.map((r) => r.customerId)).size > 1)
      return message.error(tAlerts("LaundryOrdersMixedCustomers"));
    router.push(`/pos?laundryOrders=${list.map((r) => r.id).join(",")}`);
  };

  // التسليم: طلبات قديمة اتفوترت قبل التسليم التلقائي ولسه مفتوحة
  const deliver = async (rows) => {
    const list = rows.filter((r) => r.saleId && OPEN.includes(r.status));
    if (!list.length) return message.warning(t("DeliverNeedsInvoice"));
    const res = await deliverLaundryOrdersAction({ ids: list.map((r) => r.id) });
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("DeliveredN", { n: res.data.updated }));
    refresh();
  };

  // واتساب: المفوتر ← رسالة الفاتورة + PDF، غير كده ← رسالة الطلب (مستلَم / جاهز)
  const sendWa = async (r) => {
    if (!r.saleId) return setWa({ phone: r.phone, text: waMsg.order(r) });
    const res = await getSaleAction(r.saleId);
    if (!res.success || !res.data) return setWa({ phone: r.phone, text: waMsg.order(r) });
    const doc = res.data;
    setWa({
      phone: r.phone,
      text: waMsg.invoice(doc),
      pdf: invoiceSettings
        ? {
            paperSize: invoiceSettings.paperSize,
            fileName: saleDocNo("sale", doc.number, doc.docCode),
            doc: (
              <SaleDocument
                settings={invoiceSettings}
                company={company}
                doc={doc}
                kind="sale"
              />
            ),
          }
        : null,
    });
  };

  const cancel = async () => {
    const res = await cancelLaundryOrderAction({
      id: cancelling.id,
      reason: reason.trim() || null,
    });
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("OrderCancelled"));
    setCancelling(null);
    setReason("");
    refresh();
  };

  const statusTag = (s) => (
    <Tag color={ORDER_COLORS[s]}>{t(`Status_${s}`)}</Tag>
  );
  const editable = (r) => EDITABLE.includes(r.status) && !r.saleId;

  const tile = (label, value, sub, color) => (
    <Col xs={12} md={6}>
      <Card size="small" style={{ borderInlineStart: `4px solid ${color}` }}>
        <div style={{ color: C.muted, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
        {sub && <div style={{ color: C.muted, fontSize: 12 }}>{sub}</div>}
      </Card>
    </Col>
  );

  return (
    <>
      <PageHeader
        title={t("OrdersBoard")}
        extra={
          <Space wrap>
            <Button icon={<SyncOutlined />} onClick={refresh}>
              {t("Refresh")}
            </Button>
            {can("sales.pos") && (
              <Link href="/pos">
                <Button type="primary" icon={<PlusOutlined />}>
                  {t("Receive")}
                </Button>
              </Link>
            )}
          </Space>
        }
      />

      {/* ملخص اليوم */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <b>{t("DaySummary")}</b>
        <DayPicker
          value={summaryDay}
          onChange={(v) => setSummaryDay(v || today)}
          max={today}
          style={{ width: 150 }}
        />
      </div>
      {summary && (
        <Row gutter={[12, 12]} className="mb-4">
          {tile(
            t("Sum_registered"),
            summary.registered.orders,
            t("PiecesN", { n: summary.registered.qty }),
            C.info,
          )}
          {tile(
            t("Sum_delivered"),
            summary.delivered.orders,
            t("PiecesN", { n: summary.delivered.qty }),
            C.muted,
          )}
          {tile(
            t("Sum_remaining"),
            summary.remaining.orders,
            t("PiecesN", { n: summary.remaining.qty }),
            C.warning,
          )}
        </Row>
      )}

      {/* البحث والفلاتر */}
      <Card size="small" className="mb-3">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={10}>
            <SearchBox
              placeholder={t("OrdersSearch")}
              value={q}
              onChange={setQ}
              onSearch={(v) => {
                setApplied({ q: v, day });
                // البحث برقم أو جوال: كل الحالات
                if (v.trim()) setStatus("all");
              }}
            />
          </Col>
          <Col xs={12} md={5}>
            <DayPicker
              value={day}
              onChange={(v) => setDay(v || today)}
              max={today}
              title={t("OrderDayHint")}
            />
          </Col>
          <Col xs={12} md={4}>
            <DayPicker
              allowClear
              placeholder={t("From")}
              value={range.from}
              onChange={(v) => setRange((r) => ({ ...r, from: v || null }))}
            />
          </Col>
          <Col xs={12} md={4}>
            <DayPicker
              allowClear
              placeholder={t("To")}
              value={range.to}
              onChange={(v) => setRange((r) => ({ ...r, to: v || null }))}
            />
          </Col>
        </Row>
        <div style={{ color: C.muted, fontSize: 12 }} className="mt-2">
          {t("OrdersSearchHint")}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <StatusFilters
          value={status}
          onChange={setStatus}
          options={["open", "delivered", "cancelled", "all"].map(
            (s) => ({
              value: s,
              label: t(`Status_${s}`),
              color: ORDER_COLORS[s],
              count: data.counts[s] ?? 0,
            }),
          )}
        />
        {selected.length > 0 && (
          <Space wrap>
            <span>{t("SelectedN", { n: selected.length })}</span>
            {can("sales.pos") && (
              <Button
                type="primary"
                icon={<FileDoneOutlined />}
                onClick={() => invoice(selectedRows())}
              >
                {t("InvoiceOrders")}
              </Button>
            )}
          </Space>
        )}
      </div>

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={data.rows}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        scroll={{ x: 1000 }}
        rowSelection={
          can("sales.pos")
            ? {
                selectedRowKeys: selected,
                onChange: setSelected,
                getCheckboxProps: (r) => ({
                  disabled: Boolean(r.saleId) || r.status === "cancelled",
                }),
              }
            : undefined
        }
        onRow={(r) => ({
          style: r.isUrgent && OPEN.includes(r.status)
            ? { background: C.warningSoft }
            : undefined,
        })}
        columns={[
          {
            title: t("OrderNo"),
            width: 110,
            render: (_, r) => (
              <span>
                <b style={{ fontSize: 16 }}>{r.dailyNo}</b>
                <div style={{ color: C.muted, fontSize: 12 }}>
                  <bdi>{formatDay(r.bizDay)}</bdi>
                </div>
              </span>
            ),
          },
          {
            title: t("Customer"),
            render: (_, r) => (
              <span>
                <b>{r.customerName}</b>
                <div>
                  <bdi>{r.phone}</bdi>
                </div>
              </span>
            ),
          },
          { title: t("Pieces"), width: 80, dataIndex: "totalQty" },
          {
            title: t("Total"),
            width: 110,
            render: (_, r) => <bdi>{money(r.totalAmount)}</bdi>,
          },
          {
            title: t("Status"),
            width: 150,
            render: (_, r) => (
              <Space size={4} wrap>
                {statusTag(r.status)}
                {r.isUrgent && <Tag color={C.warning}>{t("Urgent")}</Tag>}
              </Space>
            ),
          },
          {
            title: t("Invoice"),
            width: 120,
            render: (_, r) =>
              r.sale ? (
                <bdi>{saleDocNo(r.sale.type, r.sale.number, r.sale.docCode)}</bdi>
              ) : (
                <Tag>{t("NotInvoiced")}</Tag>
              ),
          },
          {
            title: t("ReceivedAt"),
            width: 160,
            render: (_, r) => <bdi>{formatDateTime(r.createdAt)}</bdi>,
          },
          {
            title: "",
            width: 200,
            fixed: "end",
            render: (_, r) => (
              <Space size={0}>
                <Button
                  type="text"
                  icon={<EyeOutlined />}
                  aria-label={t("View")}
                  title={t("View")}
                  onClick={() => setViewing(r.id)}
                />
                {r.status !== "cancelled" && (
                  <Button
                    type="text"
                    className="wa-icon"
                    icon={<WhatsAppOutlined />}
                    aria-label={t("WaSend")}
                    title={t("WaSend")}
                    onClick={() => sendWa(r)}
                  />
                )}
                {can("laundryOrders.update") && editable(r) && (
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    aria-label={t("EditOrder")}
                    title={t("EditOrder")}
                    onClick={() => router.push(`/pos?editOrder=${r.id}`)}
                  />
                )}
                {/* الفوترة من الكاشير (الطلب في السلة) */}
                {can("sales.pos") &&
                  !r.saleId &&
                  r.status !== "cancelled" && (
                    <Button
                      type="text"
                      icon={<FileDoneOutlined />}
                      aria-label={t("InvoiceOrders")}
                      title={t("InvoiceOrders")}
                      onClick={() => invoice([r])}
                    />
                  )}
                {/* المفوتر (مدفوع) ولسه ما اتسلمش ← تسليم */}
                {can("laundryOrders.update") &&
                  r.saleId &&
                  OPEN.includes(r.status) && (
                    <Button
                      type="text"
                      icon={<CarryOutOutlined />}
                      aria-label={t("Deliver")}
                      title={t("Deliver")}
                      onClick={() => deliver([r])}
                    />
                  )}
                {can("laundryOrders.cancel") &&
                  OPEN.includes(r.status) &&
                  !r.saleId && (
                    <Button
                      type="text"
                      danger
                      icon={<CloseCircleOutlined />}
                      aria-label={t("CancelOrder")}
                      title={t("CancelOrder")}
                      onClick={() => setCancelling(r)}
                    />
                  )}
              </Space>
            ),
          },
        ]}
      />

      {viewing && (
        <LaundryOrderDetails
          id={viewing}
          printSettings={printSettings}
          onClose={() => setViewing(null)}
        />
      )}

      {wa && <WhatsAppSend {...wa} onClose={() => setWa(null)} />}

      {cancelling && (
        <Modal
          open
          title={t("CancelOrderN", { n: cancelling.dailyNo })}
          okText={t("CancelOrder")}
          okButtonProps={{ danger: true }}
          onOk={cancel}
          onCancel={() => setCancelling(null)}
          mask={{ closable: false }}
          destroyOnHidden
        >
          <Input
            autoComplete="off"
            maxLength={255}
            placeholder={t("CancelReason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Modal>
      )}
    </>
  );
}
