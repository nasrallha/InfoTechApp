"use client";

import { useRef, useState } from "react";
import {
  Button,
  Card,
  Col,
  Descriptions,
  Dropdown,
  Popconfirm,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
} from "antd";
import {
  CheckCircleOutlined,
  DeleteOutlined,
  DollarOutlined,
  DownOutlined,
  EditOutlined,
  FileAddOutlined,
  FileDoneOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  PrinterOutlined,
  RollbackOutlined,
  StopOutlined,
  SwapOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PrintDocument from "@/components/printing/PrintDocument";
import PdfDocument from "@/components/printing/PdfDocument";
import SavedDocPrint from "@/components/printing/SavedDocPrint";
import { SAVE_PRINT_A4 } from "@/lib/print-param";
import {
  cancelAdvanceAction,
  cancelCertificateAction,
  deleteCertificateAction,
  deleteChangeOrderAction,
  deleteContractAction,
  deletePaymentAction,
  getCertificateAction,
  setContractStatusAction,
} from "@/actions/contracting.actions";
import { formatDay, today } from "@/lib/dates";
import { qtyText } from "@/lib/unit-qty";
import { C } from "@/lib/theme";
import { CONTRACT_STATUS_COLOR } from "./ContractsList";
import { AdvanceModal, ChangeOrderModal, PaymentModal } from "./ContractModals";
import CertificatePrint from "./CertificatePrint";
import ContractPrint from "./ContractPrint";
import { exportCertificateExcel } from "./certificateExcel";
import EditCertificateModal from "./EditCertificateModal";

// ============================================================
// تفاصيل عقد المقاولات
// - موقف العقد: القيمة (بعد أوامر التغيير) / المنفّذ ونسبة الإنجاز / الدفعة المقدمة ومستردها
//   / الضمان المحجوز / المفوتر / المحصّل / المستحق
// - التبويبات: المقايسة (المنفّذ لكل بند) | المستخلصات | أوامر التغيير | التحصيل | بيانات العقد
// - الإجراءات: مستخلص جديد، فاتورة الدفعة المقدمة، أمر تغيير، تحصيل / سداد، طباعة العقد،
//   تعديل، إقفال / إعادة فتح / إلغاء، حذف
// ============================================================
export default function ContractDetails({ contract: c, perms, paymentMethods = [], units = [] }) {
  const t = useTranslations("Contracting");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const { amount: money } = useCurrency();
  const [tab, setTab] = useState("certificates");
  const [advanceOpen, setAdvanceOpen] = useState(null); // null | "issue" | "edit"
  const [editCert, setEditCert] = useState(null); // رقم المستخلص اللي بيتعدل
  const [changeOpen, setChangeOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(null); // null | "payment" | "retention"
  const [printJob, setPrintJob] = useState(null); // فاتورة (SavedDocPrint)
  const [docJob, setDocJob] = useState(null); // { what: contract|cert, mode: print|pdf, cert? }
  const [loadingCert, setLoadingCert] = useState(null);
  // رقم فريد لكل طلب طباعة فاتورة
  const jobSeq = useRef(0);
  const pos = c.position;
  const sub = c.kind === "sub";
  const active = c.status === "active";
  // عقد من غير مقايسة (البنود في المستخلص): من غير تبويب المقايسة ولا أوامر التغيير
  const simple = c.items.length === 0;
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName || x.arName) : "—");
  const now = today();

  const run = async (action, arg, okText) => {
    const res = await action(arg);
    if (!res.success) return showActionError(res, tAlerts, locale);
    if (okText) message.success(okText);
    return res;
  };

  const printInvoice = (id) =>
    setPrintJob({
      kind: sub ? "purchase" : "sale",
      id,
      paper: "A4",
      mode: SAVE_PRINT_A4,
      text: t("InvoiceReadyToPrint"),
      seq: ++jobSeq.current,
    });

  // المستخلص للطباعة / PDF / Excel
  const certDoc = async (id, mode, invoiceNo) => {
    setLoadingCert(`${mode}-${id}`);
    const res = await getCertificateAction(id);
    if (!res.success || !res.data) {
      setLoadingCert(null);
      return showActionError(res, tAlerts, locale);
    }
    if (mode === "excel") {
      await exportCertificateExcel(res.data, t, { locale, invoiceNo });
      return setLoadingCert(null);
    }
    setLoadingCert(null);
    setDocJob({ what: "cert", mode, cert: res.data });
  };

  const removeContract = async () => {
    const res = await run(deleteContractAction, c.id, t("ContractDeleted"));
    if (res) router.push(`/contracting${sub ? "?kind=sub" : ""}`);
  };

  const docLink = (d) =>
    d ? (
      <Space size={6} wrap>
        <Link href={sub ? `/invoices/purchases/${d.id}` : `/invoices/sales/${d.id}`}>
          <bdi className="font-bold">{d.docNo}</bdi>
        </Link>
        {d.remaining > 0 ? (
          <Tag color="orange">
            {t("Remaining")} {money(d.remaining)}
          </Tag>
        ) : (
          <Tag color="green">{t("Paid")}</Tag>
        )}
        <Button size="small" aria-label={t("PrintInvoice")} title={t("PrintInvoice")} icon={<PrinterOutlined />} onClick={() => printInvoice(d.id)} />
      </Space>
    ) : (
      "—"
    );

  const lastCert = c.certificates[c.certificates.length - 1];
  const lastChange = c.changeOrders[c.changeOrders.length - 1];
  const hasFinal = c.certificates.some((x) => x.isFinal && !x.cancelled);

  // ---------------- الإجراءات ----------------
  const statusItems = [
    active && { key: "completed", icon: <CheckCircleOutlined />, label: t("MarkCompleted") },
    c.status !== "active" && { key: "active", icon: <UndoOutlined />, label: t("Reopen") },
    active && !c.hasInvoices && { key: "cancelled", icon: <StopOutlined />, danger: true, label: t("CancelContract") },
  ].filter(Boolean);

  // ---------------- الجداول ----------------
  const itemColumns = [
    { title: t("ItemNo"), dataIndex: "itemNo", width: 70, align: "center", render: (v, _, i) => v || i + 1 },
    {
      title: t("ItemDescription"),
      dataIndex: "description",
      width: 300,
      render: (v, it) => (
        <span>
          {v} {it.changeOrderId && <Tag className="cp-chip">{t("FromChangeOrder")}</Tag>}
        </span>
      ),
    },
    { title: t("Unit"), dataIndex: "unitName", width: 70, align: "center" },
    {
      title: t("Qty"),
      dataIndex: "qty",
      width: 110,
      align: "center",
      render: (v, it) => (
        <span>
          {qtyText(v)}
          {it.originalQty !== v && (
            <div className="text-xs text-slate-500">
              {t("Original")}: {qtyText(it.originalQty)}
            </div>
          )}
        </span>
      ),
    },
    { title: t("UnitPrice"), dataIndex: "price", width: 110, align: "end", render: (v) => money(v) },
    { title: t("ItemTotal"), dataIndex: "amount", width: 130, align: "end", render: (v) => money(v) },
    { title: t("DoneQty"), dataIndex: "doneQty", width: 100, align: "center", render: (v) => qtyText(v) },
    { title: t("DoneValue"), dataIndex: "doneAmount", width: 130, align: "end", render: (v) => money(v) },
    {
      title: t("Progress"),
      key: "p",
      width: 130,
      render: (_, it) => (
        <Progress
          size="small"
          strokeColor={C.success}
          percent={it.qty > 0 ? Math.min(100, Math.round((it.doneQty / it.qty) * 1000) / 10) : 0}
        />
      ),
    },
  ];

  const certColumns = [
    {
      title: t("CertNo"),
      dataIndex: "seq",
      width: 110,
      align: "center",
      render: (v, x) => (
        <span>
          <b>
            <bdi>{x.docNo}</bdi>
          </b>
          {x.docNo !== String(v) && <div className="text-xs text-slate-500">({v})</div>}
          {x.isFinal && (
            <div>
              <Tag color="blue">{t("Final")}</Tag>
            </div>
          )}
          {/* ملغي بمرتجع: خارج حسابات العقد */}
          {x.cancelled && (
            <div>
              <Tag color="red">{t("CertCancelledTag")}</Tag>
            </div>
          )}
        </span>
      ),
    },
    { title: t("CertDate"), dataIndex: "date", width: 100, render: (v) => formatDay(v) },
    { title: t("CertMode"), dataIndex: "mode", width: 95, align: "center", render: (v) => t(`mode_${v}`) },
    { title: t("Works"), dataIndex: "gross", width: 120, align: "end", render: (v) => money(v) },
    { title: t("AdvanceRecovery"), dataIndex: "recovery", width: 120, align: "end", render: (v) => money(v) },
    { title: t("Vat"), dataIndex: "taxAmount", width: 110, align: "end", render: (v) => money(v) },
    { title: t("InvoiceTotal"), dataIndex: "invoiceTotal", width: 125, align: "end", render: (v) => <b>{money(v)}</b> },
    { title: t("Retention"), dataIndex: "retention", width: 110, align: "end", render: (v) => money(v) },
    { title: t("DelayPenalty"), dataIndex: "penalty", width: 105, align: "end", render: (v) => (v ? money(v) : "—") },
    { title: t("NetPayable"), dataIndex: "netPayable", width: 125, align: "end", render: (v) => <b>{money(v)}</b> },
    { title: t("Invoice"), key: "inv", width: 250, render: (_, x) => docLink(x.doc) },
    {
      title: "",
      key: "a",
      width: 220,
      align: "center",
      render: (_, x) => (
        <Space size={4}>
          <Button
            size="small"
            aria-label={t("PrintCertificate")}
            title={t("PrintCertificate")}
            icon={<PrinterOutlined />}
            loading={loadingCert === `print-${x.id}`}
            onClick={() => certDoc(x.id, "print")}
          />
          <Button
            size="small"
            danger
            aria-label={t("CertificatePdf")}
            title={t("CertificatePdf")}
            icon={<FilePdfOutlined />}
            loading={loadingCert === `pdf-${x.id}`}
            onClick={() => certDoc(x.id, "pdf")}
          />
          <Button
            size="small"
            aria-label={t("CertificateExcel")}
            title={t("CertificateExcel")}
            icon={<FileExcelOutlined />}
            style={{ color: C.success }}
            loading={loadingCert === `excel-${x.id}`}
            onClick={() => certDoc(x.id, "excel", x.doc?.docNo)}
          />
          {/* تعديل المستخلص وفاتورته بنفس رقمها (قبل الزكاة والسندات) */}
          {perms.editInvoice && !x.cancelled && x.doc && !x.doc.locked && (
            <Button size="small" aria-label={t("EditCertificate")} title={t("EditCertificate")} icon={<EditOutlined />} onClick={() => setEditCert(x.id)} />
          )}
          {/* إلغاء بمرتجع: لو الفاتورة اتبعتت للهيئة أو عليها سداد (الحذف مقفول) */}
          {perms.cancelInvoice && !x.cancelled && x.doc && (
            <Popconfirm
              title={t("CancelCertConfirm")}
              description={t("CancelCertHint")}
              okButtonProps={{ danger: true }}
              onConfirm={() => run(cancelCertificateAction, x.id, t("CertCancelledDone"))}
            >
              <Button size="small" danger aria-label={t("CancelCertificate")} title={t("CancelCertificate")} icon={<RollbackOutlined />} />
            </Popconfirm>
          )}
          {perms.cancelInvoice && lastCert?.id === x.id && !x.cancelled && !x.doc?.locked && (
            <Popconfirm
              title={t("DeleteCertConfirm")}
              description={t("DeleteCertHint")}
              okButtonProps={{ danger: true }}
              onConfirm={() => run(deleteCertificateAction, x.id, t("CertDeleted"))}
            >
              <Button size="small" danger aria-label={t("DeleteCertificate")} title={t("DeleteCertificate")} icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const changeColumns = [
    { title: "#", dataIndex: "seq", width: 50, align: "center" },
    { title: t("Date"), dataIndex: "date", width: 100, render: (v) => formatDay(v) },
    { title: t("ChangeTitle"), dataIndex: "title", width: 260 },
    {
      title: t("ContractValueChange"),
      dataIndex: "amount",
      width: 140,
      align: "end",
      render: (v) => <span style={{ color: v < 0 ? C.dangerText : C.successText }}>{money(v)}</span>,
    },
    { title: t("Notes"), dataIndex: "notes", width: 200, render: (v) => v || "—" },
    {
      title: "",
      key: "a",
      width: 60,
      align: "center",
      render: (_, o) =>
        perms.changeOrders && lastChange?.id === o.id ? (
          <Popconfirm
            title={t("DeleteChangeConfirm")}
            okButtonProps={{ danger: true }}
            onConfirm={() => run(deleteChangeOrderAction, o.id, t("ChangeDeleted"))}
          >
            <Button size="small" danger aria-label={t("Delete")} title={t("Delete")} icon={<DeleteOutlined />} />
          </Popconfirm>
        ) : null,
    },
  ];

  const paymentColumns = [
    { title: t("Date"), dataIndex: "date", width: 100, render: (v) => formatDay(v) },
    {
      title: t("PaymentKind"),
      dataIndex: "kind",
      width: 140,
      render: (v) => <Tag color={v === "retention" ? "blue" : "green"}>{t(`pay_${v}`)}</Tag>,
    },
    { title: t("Amount"), dataIndex: "amount", width: 130, align: "end", render: (v) => <b>{money(v)}</b> },
    {
      title: t("Voucher"),
      key: "v",
      width: 140,
      render: (_, p) => (
        <Link href={`/accounts/vouchers/${p.voucher.id}`}>
          <bdi>{p.voucher.docNo}</bdi>
        </Link>
      ),
    },
    { title: t("Notes"), dataIndex: "notes", width: 220, render: (v) => v || "—" },
    {
      title: "",
      key: "a",
      width: 60,
      align: "center",
      render: (_, p) =>
        perms.payments ? (
          <Popconfirm
            title={t("DeletePaymentConfirm")}
            okButtonProps={{ danger: true }}
            onConfirm={() => run(deletePaymentAction, p.id, t("PaymentDeleted"))}
          >
            <Button size="small" danger aria-label={t("Delete")} title={t("Delete")} icon={<DeleteOutlined />} />
          </Popconfirm>
        ) : null,
    },
  ];

  const sumTable = (cols) => cols.reduce((s, x) => s + x.width, 0);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          {sub ? t("SubContract") : t("OwnerContract")} <bdi>{c.docNo}</bdi>{" "}
          <Tag color={CONTRACT_STATUS_COLOR[c.status]}>{t(`status_${c.status}`)}</Tag>
        </h1>
        <Space wrap>
          {perms.invoice && active && !hasFinal && (
            <Button type="primary" icon={<FileAddOutlined />} onClick={() => router.push(`/contracting/${c.id}/certificate`)}>
              {t("NewCertificate")}
            </Button>
          )}
          {perms.invoice && active && pos.advanceAmount > 0 && !pos.advanceIssued && (
            <Button color="cyan" variant="solid" icon={<FileDoneOutlined />} onClick={() => setAdvanceOpen("issue")}>
              {t("IssueAdvance")}
            </Button>
          )}
          {perms.payments && (
            <Button color="green" variant="solid" icon={<DollarOutlined />} onClick={() => setPayOpen("payment")}>
              {sub ? t("PayToSub") : t("CollectFromOwner")}
            </Button>
          )}
          {perms.changeOrders && active && !simple && (
            <Button color="orange" variant="solid" icon={<SwapOutlined />} onClick={() => setChangeOpen(true)}>
              {t("NewChangeOrder")}
            </Button>
          )}
          <Dropdown
            menu={{
              items: [
                { key: "print", icon: <PrinterOutlined />, label: t("PrintContract") },
                { key: "pdf", icon: <FilePdfOutlined />, label: t("ContractPdf") },
              ],
              onClick: ({ key }) => setDocJob({ what: "contract", mode: key }),
            }}
          >
            <Button color="purple" variant="solid" icon={<PrinterOutlined />}>
              {t("PrintContract")} <DownOutlined />
            </Button>
          </Dropdown>
          {perms.update && (
            <Button color="blue" variant="solid" icon={<EditOutlined />} onClick={() => router.push(`/contracting/${c.id}/edit`)}>
              {t("Edit")}
            </Button>
          )}
          {perms.update && statusItems.length > 0 && (
            <Dropdown
              menu={{
                items: statusItems,
                onClick: ({ key }) => run(setContractStatusAction, { id: c.id, status: key }, t("StatusChanged")),
              }}
            >
              <Button color="default" variant="solid">
                {t("ContractStatus")} <DownOutlined />
              </Button>
            </Dropdown>
          )}
          {perms.delete && (
            <Popconfirm
              title={t("DeleteContractConfirm")}
              description={t("DeleteContractHint")}
              okButtonProps={{ danger: true }}
              onConfirm={removeContract}
              disabled={c.hasInvoices}
            >
              <Button color="danger" variant="solid" icon={<DeleteOutlined />} disabled={c.hasInvoices} title={c.hasInvoices ? t("ContractHasInvoicesHint") : undefined}>
                {t("DeleteContract")}
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      {/* طباعة الفاتورة (A4) */}
      <SavedDocPrint job={printJob} onClose={() => setPrintJob(null)} />

      {/* موقف العقد */}
      <Row gutter={[12, 12]} className="mb-3">
        {[
          {
            k: "ContractValue",
            v: pos.totalAmount,
            hint: pos.changes ? `${t("Changes")} ${money(pos.changes)}` : t("BeforeTax"),
          },
          { k: "CertifiedWorks", v: pos.certified, hint: pos.totalAmount ? `${pos.progress}%` : null },
          {
            k: "AdvanceLeft",
            v: pos.advanceLeft,
            hint: pos.advanceIssued
              ? `${t("Of")} ${money(pos.advanceAmount + pos.priorAdvance)}`
              : pos.priorAdvance > 0
                ? t("PriorAdvanceShort")
                : t("NotIssued"),
          },
          { k: "RetentionHeld", v: pos.retentionLeft, hint: c.retentionReleaseDate ? formatDay(c.retentionReleaseDate) : null },
          { k: "Invoiced", v: pos.invoiced, hint: t("WithTax") },
          { k: sub ? "Paid" : "Collected", v: pos.collected, color: C.successText },
          { k: "Due", v: pos.due, color: pos.due > 0 ? C.dangerText : undefined },
        ].filter(Boolean).map((x) => (
          <Col xs={12} md={8} lg={6} xl={3} key={x.k} flex="1">
            <Card size="small" className="h-full">
              <Statistic
                title={
                  <span>
                    {t(x.k)}
                    {x.hint && <span className="text-xs text-slate-400"> ({x.hint})</span>}
                  </span>
                }
                value={money(x.v)}
                styles={x.color ? { content: { color: x.color, fontSize: 18 } } : { content: { fontSize: 18 } }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* الدفعة المقدمة */}
      {pos.advanceAmount > 0 && (
        <Card size="small" className="mb-3">
          <Space wrap size={12}>
            <b>{t("AdvanceInvoice")}:</b>
            <span>
              {money(pos.advanceAmount)} ({c.advancePct}%)
            </span>
            {c.advanceDoc ? docLink(c.advanceDoc) : <Tag color="orange">{t("NotIssued")}</Tag>}
            {/* حالة السداد على الفاتورة: مدفوعة / جزئي / آجل */}
            {c.advanceDoc &&
              (c.advanceDoc.remaining <= 0 ? (
                <Tag color="green">{t("PaidFull")}</Tag>
              ) : c.advanceDoc.paid > 0 ? (
                <Tag color="gold">
                  {t("PaidPartial")}: {money(c.advanceDoc.paid)}
                </Tag>
              ) : (
                <Tag color="orange">{t("OnCredit")}</Tag>
              ))}
            {c.advanceDoc && perms.editInvoice && active && !c.advanceDoc.locked && (
              <Button size="small" color="blue" variant="solid" icon={<EditOutlined />} onClick={() => setAdvanceOpen("edit")}>
                {t("EditAdvance")}
              </Button>
            )}
            {c.advanceDoc && perms.cancelInvoice && pos.recovered === 0 && !c.advanceDoc.locked && (
              <Popconfirm
                title={t("CancelAdvanceConfirm")}
                okButtonProps={{ danger: true }}
                onConfirm={() => run(cancelAdvanceAction, c.id, t("AdvanceCancelled"))}
              >
                <Button size="small" danger icon={<StopOutlined />}>
                  {t("CancelAdvance")}
                </Button>
              </Popconfirm>
            )}
            {pos.advanceIssued && (
              <span className="text-slate-500">
                {t("Recovered")}: {money(pos.recovered)}
              </span>
            )}
          </Space>
        </Card>
      )}

      <Card size="small">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: "certificates",
              label: `${t("Certificates")} (${c.certificates.length})`,
              children: (
                <Table
                  size="small"
                  bordered
                  rowKey="id"
                  pagination={false}
                  dataSource={c.certificates}
                  columns={certColumns}
                  tableLayout="fixed"
                  scroll={{ x: sumTable(certColumns) }}
                  locale={{ emptyText: t("NoCertificates") }}
                />
              ),
            },
            !simple && {
              key: "boq",
              label: `${t("Boq")} (${c.items.length})`,
              children: (
                <Table
                  size="small"
                  bordered
                  rowKey="id"
                  pagination={false}
                  dataSource={c.items}
                  columns={itemColumns}
                  tableLayout="fixed"
                  scroll={{ x: sumTable(itemColumns) }}
                  summary={() => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={5}>
                        <b>{t("Total")}</b>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="end">
                        <b>{money(pos.totalAmount)}</b>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={6} />
                      <Table.Summary.Cell index={7} align="end">
                        <b>{money(pos.certified)}</b>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={8}>
                        <Progress size="small" strokeColor={C.success} percent={pos.progress} />
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  )}
                />
              ),
            },
            !simple && {
              key: "changes",
              label: `${t("ChangeOrders")} (${c.changeOrders.length})`,
              children: (
                <Table
                  size="small"
                  bordered
                  rowKey="id"
                  pagination={false}
                  dataSource={c.changeOrders}
                  columns={changeColumns}
                  tableLayout="fixed"
                  scroll={{ x: sumTable(changeColumns) }}
                  locale={{ emptyText: t("NoChangeOrders") }}
                  expandable={{
                    expandedRowRender: (o) => (
                      <Table
                        size="small"
                        rowKey={(_, i) => i}
                        pagination={false}
                        dataSource={o.lines}
                        columns={[
                          { title: t("ItemNo"), dataIndex: "itemNo", width: 70 },
                          { title: t("ItemDescription"), dataIndex: "description" },
                          { title: t("Unit"), dataIndex: "unitName", width: 70 },
                          { title: t("QtyChange"), dataIndex: "qtyDelta", width: 100, render: (v) => qtyText(v) },
                          { title: t("UnitPrice"), dataIndex: "price", width: 110, render: (v) => money(v) },
                          { title: t("Amount"), dataIndex: "amount", width: 120, render: (v) => money(v) },
                        ]}
                      />
                    ),
                  }}
                />
              ),
            },
            {
              key: "payments",
              label: `${sub ? t("PaymentsToSub") : t("Collections")} (${c.payments.length})`,
              children: (
                <div>
                  {perms.payments && pos.retentionLeft > 0 && (
                    <div className="mb-2">
                      <Button icon={<DollarOutlined />} onClick={() => setPayOpen("retention")}>
                        {t("ReleaseRetention")} ({money(pos.retentionLeft)})
                      </Button>
                    </div>
                  )}
                  <Table
                    size="small"
                    bordered
                    rowKey="id"
                    pagination={false}
                    dataSource={c.payments}
                    columns={paymentColumns}
                    tableLayout="fixed"
                    scroll={{ x: sumTable(paymentColumns) }}
                    locale={{ emptyText: t("NoPayments") }}
                  />
                </div>
              ),
            },
            {
              key: "info",
              label: t("ContractInfo"),
              children: (
                <Descriptions
                  size="small"
                  bordered
                  column={{ xs: 1, md: 2, xl: 3 }}
                  items={[
                    {
                      key: "p",
                      label: sub ? t("Subcontractor") : t("Owner"),
                      children: (
                        <span>
                          {nameOf(c.party)} {c.party?.phone && <bdi className="text-slate-500">({c.party.phone})</bdi>}
                        </span>
                      ),
                    },
                    { key: "pr", label: t("ProjectName"), children: c.projectName },
                    { key: "l", label: t("ProjectLocation"), children: c.projectLocation || "—" },
                    { key: "r", label: t("RefNo"), children: c.refNo ? <bdi>{c.refNo}</bdi> : "—" },
                    { key: "s", label: t("SignDate"), children: formatDay(c.signDate) },
                    { key: "st", label: t("StartDate"), children: c.startDate ? formatDay(c.startDate) : "—" },
                    {
                      key: "e",
                      label: t("EndDate"),
                      children: (
                        <span style={active && c.endDate < now ? { color: C.dangerText } : undefined}>{formatDay(c.endDate)}</span>
                      ),
                    },
                    { key: "v", label: t("OriginalValue"), children: money(pos.baseAmount) },
                    { key: "tv", label: t("TotalWithTax"), children: money(pos.totalWithTax) },
                    { key: "ap", label: t("AdvancePct"), children: `${c.advancePct}%` },
                    { key: "rp", label: t("RecoveryPct"), children: `${c.recoveryPct}%` },
                    {
                      key: "rt",
                      label: t("RetentionPct"),
                      // النسبة + إجمالي حجز الضمان على قيمة العقد
                      children: `${c.retentionPct}% (${money(Math.round(pos.totalAmount * c.retentionPct) / 100)})`,
                    },
                    ...(pos.priorAdvance > 0
                      ? [{ key: "pa0", label: t("PriorAdvance"), children: money(pos.priorAdvance) }]
                      : []),
                    { key: "rd", label: t("RetentionReleaseDate"), children: c.retentionReleaseDate ? formatDay(c.retentionReleaseDate) : "—" },
                    {
                      key: "pn",
                      label: t("PenaltyPerDay"),
                      children: c.penaltyPerDay ? `${money(c.penaltyPerDay)} (${t("Max")} ${c.penaltyMaxPct}%)` : "—",
                    },
                    { key: "b", label: t("Branch"), children: nameOf(c.branch) },
                    ...(c.parent
                      ? [
                          {
                            key: "pa",
                            label: t("MainProject"),
                            children: (
                              <Link href={`/contracting/${c.parent.id}`}>
                                <bdi>{c.parent.docNo}</bdi> - {c.parent.projectName}
                              </Link>
                            ),
                          },
                        ]
                      : []),
                    ...(c.subs.length
                      ? [
                          {
                            key: "subs",
                            label: t("SubContracts"),
                            span: 3,
                            children: (
                              <Space orientation="vertical" size={2}>
                                {c.subs.map((s) => (
                                  <Link key={s.id} href={`/contracting/${s.id}`}>
                                    <bdi>{s.docNo}</bdi> - {nameOf(s.supplier)} - {money(s.totalAmount)} ({t("CertifiedWorks")}{" "}
                                    {money(s.certified)})
                                  </Link>
                                ))}
                              </Space>
                            ),
                          },
                        ]
                      : []),
                    ...(c.notes ? [{ key: "n", label: t("Notes"), children: c.notes, span: 3 }] : []),
                  ]}
                />
              ),
            },
          ].filter(Boolean)}
        />
      </Card>

      {editCert && (
        <EditCertificateModal certId={editCert} methods={paymentMethods} units={units} onClose={() => setEditCert(null)} />
      )}
      {/* الدفعة المقدمة: إصدار / تعديل (بتتعمل من جديد كل مرة بقيمها) */}
      {advanceOpen && (advanceOpen === "edit" ? perms.editInvoice : perms.invoice) && (
        <AdvanceModal
          contract={c}
          methods={paymentMethods}
          edit={advanceOpen === "edit"}
          onClose={() => setAdvanceOpen(null)}
          onDone={(d) => printInvoice(d.saleId ?? d.purchaseId)}
        />
      )}
      {/* النوافذ بتتعمل من جديد كل مرة (قيم فاضية) */}
      {perms.payments && payOpen && (
        <PaymentModal contract={c} methods={paymentMethods} initialKind={payOpen} onClose={() => setPayOpen(null)} />
      )}
      {perms.changeOrders && changeOpen && <ChangeOrderModal contract={c} onClose={() => setChangeOpen(false)} />}

      {/* طباعة / PDF: العقد أو المستخلص */}
      {docJob?.mode === "print" && (
        <PrintDocument paperSize="A4" onDone={() => setDocJob(null)}>
          {docJob.what === "contract" ? <ContractPrint contract={c} /> : <CertificatePrint cert={docJob.cert} />}
        </PrintDocument>
      )}
      {docJob?.mode === "pdf" && (
        <PdfDocument
          paperSize="A4"
          fileName={docJob.what === "contract" ? `contract-${c.docNo}` : `certificate-${docJob.cert.docNo}`}
          onDone={() => setDocJob(null)}
        >
          {docJob.what === "contract" ? <ContractPrint contract={c} /> : <CertificatePrint cert={docJob.cert} />}
        </PdfDocument>
      )}
    </div>
  );
}
