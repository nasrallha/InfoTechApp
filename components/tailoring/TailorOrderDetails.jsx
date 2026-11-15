"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
} from "antd";
import {
  CheckOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  FormOutlined,
  PrinterOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import PageHeader from "@/components/common/PageHeader";
import DayPicker from "@/components/common/DayPicker";
import ClientOnly from "@/components/common/ClientOnly";
import SavedDocPrint from "@/components/printing/SavedDocPrint";
import { SAVE_PRINT_THERMAL } from "@/lib/print-param";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { formatDate, formatDateTime, formatDay, today } from "@/lib/dates";
import { OPEN_STATUSES, STATUS_COLOR } from "@/lib/tailoring";
import { C } from "@/lib/theme";
import {
  assignTailorOrderAction,
  cancelTailorOrderAction,
  deleteTailorOrderAction,
  deliverTailorOrderAction,
  setTailorOrderStatusAction,
} from "@/actions/tailoring.actions";
import CardActions from "./CardActions";
import PayDueModal from "./PayDueModal";
import "./tailoring.css";

// ============================================================
// طلب التفصيل: البيانات والمبالغ + لكل شخص مقاساته وتفاصيله بالصور
// - الحالة: جديد / تحت التفصيل / جاهز
// - الخياط وموعد التسليم (الخياط بيتحط على الفاتورة ← العمولات)
// - التسليم: تحصيل الباقي (سند قبض) أو التسليم من غير تحصيل
// - الإلغاء: الفاتورة بتتحذف (لو مسموح)
// ============================================================
export default function TailorOrderDetails({
  order: o,
  perms,
  technicians,
  fields,
  groups,
  paymentMethods = [],
}) {
  const t = useTranslations("Tailoring");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nameOf = (x) =>
    x ? (locale === "ar" ? x.arName : x.enName || x.arName) : "";
  const open = OPEN_STATUSES.includes(o.status);

  const [printJob, setPrintJob] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assign, setAssign] = useState({
    technicianId: o.technician?.id ?? null,
    deliveryDate: o.deliveryDate,
  });
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [collect, setCollect] = useState({
    amount: o.due,
    methodId: paymentMethods[0]?.id ?? null,
    reference: "",
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const needsRef = paymentMethods.find(
    (m) => m.id === collect.methodId,
  )?.requiresReference;

  const run = async (fn, okText) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.success) {
      showActionError(res, tAlerts, locale);
      return false;
    }
    message.success(okText);
    return true;
  };

  const setStatus = (status) =>
    run(
      () => setTailorOrderStatusAction({ ids: [o.id], status }),
      t("StatusUpdated", { n: 1 }),
    );

  const saveAssign = async () => {
    const ok = await run(
      () =>
        assignTailorOrderAction({
          id: o.id,
          technicianId: assign.technicianId,
          deliveryDate: assign.deliveryDate,
        }),
      t("Saved"),
    );
    if (ok) setAssignOpen(false);
  };

  const deliver = async () => {
    // من غير صلاحية التحصيل: تسليم بس (الباقي يفضل على العميل)
    const pay = perms.collect && collect.amount > 0 && collect.methodId;
    const ok = await run(
      () =>
        deliverTailorOrderAction({
          id: o.id,
          paymentMethodId: pay ? collect.methodId : null,
          amount: pay ? collect.amount : null,
          reference: collect.reference || null,
        }),
      t("Delivered"),
    );
    if (ok) setDeliverOpen(false);
  };

  const cancel = () =>
    run(() => cancelTailorOrderAction({ id: o.id, reason }), t("Cancelled"));
  const router = useRouter();
  const remove = async () => {
    const ok = await run(
      () => deleteTailorOrderAction(o.id),
      t("OrderDeleted"),
    );
    if (ok) router.push("/tailoring");
  };

  return (
    <div>
      <PageHeader
        title={
          <Space>
            {t("Order")} <bdi>{o.docNo}</bdi>
            <Tag color={STATUS_COLOR[o.status]}>{t(`st_${o.status}`)}</Tag>
            {o.late && <Tag color="red">{t("st_late")}</Tag>}
          </Space>
        }
        extra={
          <Space wrap>
            {/* كارت الطلب للخياط: طباعة / PDF */}
            <CardActions order={o} fields={fields} groups={groups} />
            {o.sale && (
              <Button
                icon={<PrinterOutlined />}
                onClick={() =>
                  setPrintJob({
                    kind: "sale",
                    id: o.sale.id,
                    mode: SAVE_PRINT_THERMAL,
                    text: t("InvoiceReady"),
                    seq: Date.now(),
                  })
                }
              >
                {t("PrintInvoice")}
              </Button>
            )}
            {o.status !== "cancelled" && o.due > 0 && perms.collect && (
              <Button
                type="primary"
                icon={<DollarOutlined />}
                onClick={() => setPaying(true)}
              >
                {t("PayDue")}
              </Button>
            )}
            {open && perms.update && (
              <Button
                icon={<FormOutlined />}
                onClick={() => router.push(`/tailoring/${o.id}/edit`)}
              >
                {t("EditOrder")}
              </Button>
            )}
            {perms.delete && (
              <Popconfirm
                title={t("DeleteOrderConfirm")}
                description={
                  <div style={{ maxWidth: 280 }}>{t("DeleteOrderHint")}</div>
                }
                okButtonProps={{ danger: true, loading: busy }}
                onConfirm={remove}
              >
                <Button danger icon={<DeleteOutlined />}>
                  {t("DeleteOrder")}
                </Button>
              </Popconfirm>
            )}
            {open && perms.update && (
              <Button
                icon={<EditOutlined />}
                onClick={() => setAssignOpen(true)}
              >
                {t("TailorAndDate")}
              </Button>
            )}
            {open && perms.deliver && (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => setDeliverOpen(true)}
              >
                {t("Deliver")}
              </Button>
            )}
            {open && perms.cancel && (
              <Popconfirm
                title={t("CancelConfirm")}
                description={
                  <div style={{ maxWidth: 280 }}>
                    <div className="mb-2">{t("CancelHint")}</div>
                    <Input
                      autoComplete="off"
                      maxLength={255}
                      placeholder={t("CancelReason")}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                }
                okButtonProps={{ danger: true, loading: busy }}
                onConfirm={cancel}
              >
                <Button danger icon={<StopOutlined />}>
                  {t("CancelOrder")}
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
      />

      {o.status === "cancelled" && (
        <Alert
          type="error"
          showIcon
          className="mb-3"
          title={t("CancelledAt", { at: formatDateTime(o.cancelledAt) })}
          description={o.cancelReason}
        />
      )}

      <Row gutter={[12, 12]} className="mb-3">
        <Col xs={24} lg={16}>
          <Card size="small" className="h-full">
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2, lg: 3 }}
              items={[
                {
                  key: "c",
                  label: t("Customer"),
                  children: (
                    <span>
                      <b>{nameOf(o.customer)}</b>{" "}
                      <bdi className="text-slate-500">({o.customer.code})</bdi>
                    </span>
                  ),
                },
                {
                  key: "ph",
                  label: t("Phone"),
                  children: <bdi>{o.customer.phone ?? "—"}</bdi>,
                },
                {
                  key: "od",
                  label: t("OrderDate"),
                  children: <bdi>{formatDate(o.orderDate)}</bdi>,
                },
                {
                  key: "dd",
                  label: t("DeliveryDate"),
                  children: (
                    <bdi
                      style={
                        o.late
                          ? { color: C.dangerText, fontWeight: 700 }
                          : undefined
                      }
                    >
                      {formatDay(o.deliveryDate)}
                    </bdi>
                  ),
                },
                {
                  key: "tl",
                  label: t("Tailor"),
                  children: o.technician ? nameOf(o.technician) : "—",
                },
                { key: "pc", label: t("Pieces"), children: o.pieces },
                { key: "br", label: t("Branch"), children: nameOf(o.branch) },
                {
                  key: "inv",
                  label: t("Invoice"),
                  children: o.sale ? (
                    <Link href={`/invoices/sales/${o.sale.id}`}>
                      <bdi>{o.sale.docNo}</bdi>
                    </Link>
                  ) : (
                    "—"
                  ),
                },
                {
                  key: "by",
                  label: t("CreatedBy"),
                  children: nameOf({
                    arName: o.createdBy?.arFullname,
                    enName: o.createdBy?.enFullname,
                  }),
                },
                ...(o.readyAt
                  ? [
                      {
                        key: "ra",
                        label: t("ReadyAt"),
                        children: <bdi>{formatDateTime(o.readyAt)}</bdi>,
                      },
                    ]
                  : []),
                ...(o.deliveredAt
                  ? [
                      {
                        key: "da",
                        label: t("DeliveredAt"),
                        children: <bdi>{formatDateTime(o.deliveredAt)}</bdi>,
                      },
                    ]
                  : []),
                ...(o.notes
                  ? [{ key: "n", label: t("Notes"), children: o.notes }]
                  : []),
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" className="h-full">
            <Row gutter={[8, 8]}>
              <Col xs={8}>
                <Statistic title={t("Total")} value={money(o.total)} />
                {o.discount > 0 && (
                  <div className="text-xs text-slate-500">
                    {t("Discount")}: {money(o.discount)}
                  </div>
                )}
              </Col>
              <Col xs={8}>
                <Statistic
                  title={t("Paid")}
                  value={money(o.paid)}
                  styles={{ content: { color: C.successText } }}
                />
              </Col>
              <Col xs={8}>
                <Statistic
                  title={t("Due")}
                  value={money(o.due)}
                  styles={{
                    content: { color: o.due > 0 ? C.dangerText : undefined },
                  }}
                />
              </Col>
            </Row>
            {open && perms.update && (
              <div className="mt-3">
                <div className="text-xs text-slate-500 mb-1">{t("Status")}</div>
                <Segmented
                  block
                  value={o.status}
                  disabled={busy}
                  onChange={setStatus}
                  options={OPEN_STATUSES.map((s) => ({
                    value: s,
                    label: t(`st_${s}`),
                  }))}
                />
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* تفاصيل الطلب: جدول (سطر لكل شخص) - الكارت بالرسومات للطباعة */}
      <Card size="small" className="mb-3" title={t("OrderDetails")}>
        <Table
          bordered
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={o.lines}
          scroll={{ x: 1300 }}
          columns={[
            {
              title: "#",
              key: "n",
              width: 45,
              align: "center",
              render: (_, __, i) => i + 1,
            },
            {
              title: t("Person"),
              dataIndex: "personName",
              width: 140,
              render: (v) => <b>{v}</b>,
            },
            {
              title: t("Pieces"),
              dataIndex: "pieces",
              width: 70,
              align: "center",
            },
            {
              title: t("FabricType"),
              key: "f",
              width: 170,
              render: (_, l) =>
                l.fabricName ? `${l.fabricName} (${l.fabricQty})` : "—",
            },
            {
              title: t("SewPrice"),
              dataIndex: "sewPrice",
              width: 100,
              align: "end",
              render: (v) => money(v),
            },
            {
              title: t("Measurements"),
              key: "m",
              width: 330,
              render: (_, l) =>
                l.measures.length
                  ? l.measures.map((m) => (
                      <Tag key={m.id} className="cp-chip">
                        {nameOf(m)}: <bdi>{m.value}</bdi>
                      </Tag>
                    ))
                  : "—",
            },
            {
              title: t("Styles"),
              key: "s",
              width: 330,
              render: (_, l) =>
                l.styles.length
                  ? l.styles.map((g) => (
                      <div key={g.id}>
                        <span className="text-slate-500">{nameOf(g)}:</span>{" "}
                        {g.choices.map((c) => nameOf(c)).join(" + ")}
                      </div>
                    ))
                  : "—",
            },
            {
              title: t("Notes"),
              dataIndex: "notes",
              width: 150,
              render: (v) => v || "—",
            },
          ]}
        />
      </Card>

      {/* النوافذ في المتصفح بس */}
      <ClientOnly>
        <Modal
          open={assignOpen}
          title={t("TailorAndDate")}
          onCancel={() => setAssignOpen(false)}
          onOk={saveAssign}
          confirmLoading={busy}
          width={460}
        >
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={12}>
              <div className="text-xs text-slate-500 mb-1">{t("Tailor")}</div>
              <Select
                allowClear
                style={{ width: "100%" }}
                placeholder={t("NoTailor")}
                value={assign.technicianId ?? undefined}
                options={technicians.map((x) => ({
                  value: x.id,
                  label: nameOf(x),
                }))}
                onChange={(v) =>
                  setAssign((a) => ({ ...a, technicianId: v ?? null }))
                }
              />
            </Col>
            <Col xs={24} sm={12}>
              <div className="text-xs text-slate-500 mb-1">
                {t("DeliveryDate")}
              </div>
              <DayPicker
                style={{ width: "100%" }}
                value={assign.deliveryDate}
                min={today() < o.deliveryDate ? today() : o.deliveryDate}
                onChange={(v) => setAssign((a) => ({ ...a, deliveryDate: v }))}
              />
            </Col>
          </Row>
        </Modal>

        <Modal
          open={deliverOpen}
          title={t("Deliver")}
          onCancel={() => setDeliverOpen(false)}
          onOk={deliver}
          okText={t("ConfirmDeliver")}
          confirmLoading={busy}
          width={520}
        >
          {o.due > 0 && perms.collect ? (
            <>
              <p className="mb-3">
                {t("DeliverDueHint", { due: money(o.due) })}
              </p>
              <Row gutter={[12, 12]}>
                <Col xs={12}>
                  <div className="text-xs text-slate-500 mb-1">
                    {t("CollectNow")}
                  </div>
                  <InputNumber
                    style={{ width: "100%" }}
                    min={0}
                    max={o.due}
                    value={collect.amount}
                    onChange={(v) =>
                      setCollect((c) => ({ ...c, amount: v ?? 0 }))
                    }
                  />
                </Col>
                <Col xs={12}>
                  <div className="text-xs text-slate-500 mb-1">
                    {t("PaymentMethod")}
                  </div>
                  <Select
                    style={{ width: "100%" }}
                    value={collect.methodId ?? undefined}
                    options={paymentMethods.map((m) => ({
                      value: m.id,
                      label: nameOf(m),
                    }))}
                    onChange={(v) => setCollect((c) => ({ ...c, methodId: v }))}
                  />
                </Col>
                {needsRef && (
                  <Col xs={24}>
                    <div className="text-xs text-slate-500 mb-1">
                      {t("Reference")}
                    </div>
                    <Input
                      dir="ltr"
                      maxLength={100}
                      value={collect.reference}
                      onChange={(e) =>
                        setCollect((c) => ({ ...c, reference: e.target.value }))
                      }
                    />
                  </Col>
                )}
              </Row>
              <p className="text-xs text-slate-500 mt-3 mb-0">
                {t("CollectHint")}
              </p>
            </>
          ) : o.due > 0 ? (
            <Alert type="warning" showIcon title={t("NoCollectPermission")} />
          ) : (
            <p>{t("DeliverPaidHint")}</p>
          )}
        </Modal>
      </ClientOnly>

      {paying && (
        <PayDueModal
          order={o}
          paymentMethods={paymentMethods}
          onClose={() => setPaying(false)}
        />
      )}
      <SavedDocPrint job={printJob} onClose={() => setPrintJob(null)} />
    </div>
  );
}
