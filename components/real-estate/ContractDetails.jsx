"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
} from "antd";
import {
  DeleteOutlined,
  StopOutlined,
  EditOutlined,
  FileDoneOutlined,
  LogoutOutlined,
  PrinterOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCompany } from "@/components/common/CompanyProvider";
import DayPicker from "@/components/common/DayPicker";
import PrintDocument from "@/components/printing/PrintDocument";
import {
  cancelInstallmentInvoiceAction,
  deleteContractAction,
  terminateContractAction,
} from "@/actions/rent-contract.actions";
import SavedDocPrint from "@/components/printing/SavedDocPrint";
import { SAVE_PRINT_A4 } from "@/lib/print-param";
import IssueInvoiceModal from "./IssueInvoiceModal";
import { formatDay, today } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import { C } from "@/lib/theme";
import { imageUrl } from "@/lib/image";
import { CONTRACT_STATUS_COLOR } from "./ContractsList";
import ClientOnly from "@/components/common/ClientOnly";

// ============================================================
// تفاصيل عقد الإيجار
// - الدفعات: مستحقة / متأخرة / اتفوترت (رقم الفاتورة والمتبقي) / اتلغت
//   «إصدار فاتورة» على الدفعة ← فاتورة ضريبية بفترة السداد
// - طباعة العقد (النص المحفوظ) - تعديل (قبل أي فاتورة) - تجديد - خروج مبكر
// ============================================================
export default function ContractDetails({ contract: c, perms, paymentMethods = [] }) {
  const t = useTranslations("RealEstate");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const company = useCompany();
  const { amount: money } = useCurrency();
  const [printing, setPrinting] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitForm] = Form.useForm();
  // فاتورة الدفعة (نافذة الإصدار) + شريط الطباعة A4 بعد الإصدار / من الدفعة
  const [invFor, setInvFor] = useState(null);
  // تعديل فاتورة دفعة: القيمة + السداد (نفس نافذة الإصدار)
  const [editFor, setEditFor] = useState(null);
  const [printJob, setPrintJob] = useState(null);
  const now = today();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName || x.arName) : "");
  const printInvoice = (saleId, auto) =>
    setPrintJob({
      kind: "sale",
      id: saleId,
      paper: "A4",
      mode: auto ? SAVE_PRINT_A4 : null,
      text: t("InvoiceReadyToPrint"),
      seq: Date.now(),
    });

  // موقف العقد: قيمة العقد ← المفوتر ← المحصّل ← المتبقي على الفواتير ← اللي لسه متفوترش
  // (كشف حساب المستأجر بيعرض الفواتير والسداد بس: المديونية بتبدأ بالفاتورة)
  const sales = c.installments.filter((i) => i.sale).map((i) => i.sale);
  const pos = {
    invoiced: sales.reduce((s, x) => s + x.totalAmount, 0),
    collected: sales.reduce((s, x) => s + x.totalAmount - x.remainingAmount, 0),
    outstanding: sales.reduce((s, x) => s + x.remainingAmount, 0),
    notInvoiced: c.installments
      .filter((i) => i.status === "due")
      .reduce((s, i) => s + i.amount, 0),
  };

  // إلغاء فاتورة الدفعة (للتصحيح وإصدارها تاني)
  const cancelInvoice = async (inst) => {
    const res = await cancelInstallmentInvoiceAction(inst.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("InvoiceCancelled"));
  };
  // حذف العقد (من غير فواتير) ← قائمة العقود
  const hasInvoices = c.installments.some((i) => i.saleId);
  const removeContract = async () => {
    const res = await deleteContractAction(c.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("ContractDeleted"));
    router.push("/real-estate/contracts");
  };

  const terminate = async (v) => {
    const res = await terminateContractAction({ id: c.id, exitDate: v.exitDate, reason: v.reason });
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("ContractTerminated"));
    setExitOpen(false);
  };

  const instStatus = (i) => {
    if (i.status === "invoiced")
      return <Tag color="green">{t("inst_invoiced")}</Tag>;
    if (i.status === "cancelled") return <Tag>{t("inst_cancelled")}</Tag>;
    return i.dueDate < now ? (
      <Tag color="red">{t("inst_overdue")}</Tag>
    ) : (
      <Tag color="orange">{t("inst_due")}</Tag>
    );
  };

  const active = c.status === "active";

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          {t("Contract")} <bdi>{c.docNo}</bdi>{" "}
          <Tag color={CONTRACT_STATUS_COLOR[c.status]}>{t(`cstatus_${c.status}`)}</Tag>
        </h1>
        <Space wrap>
          <Button icon={<PrinterOutlined />} disabled={!c.content} onClick={() => setPrinting(true)}>
            {t("PrintContract")}
          </Button>
          {perms.update && active && (
            <Button icon={<EditOutlined />} onClick={() => router.push(`/real-estate/contracts/${c.id}/edit`)}>
              {t("Edit")}
            </Button>
          )}
          {perms.create && c.status !== "terminated" && (
            <Button icon={<SyncOutlined />} onClick={() => router.push(`/real-estate/contracts/new?renew=${c.id}`)}>
              {t("Renew")}
            </Button>
          )}
          {perms.delete && (
            <Popconfirm
              title={t("DeleteContractConfirm")}
              description={t("DeleteContractHint")}
              okButtonProps={{ danger: true }}
              onConfirm={removeContract}
              disabled={hasInvoices}
            >
              <Button danger icon={<DeleteOutlined />} disabled={hasInvoices} title={hasInvoices ? t("ContractHasInvoicesHint") : undefined}>
                {t("DeleteContract")}
              </Button>
            </Popconfirm>
          )}
          {perms.terminate && active && (
            <Button
              danger
              icon={<LogoutOutlined />}
              onClick={() => {
                exitForm.setFieldsValue({ exitDate: now < c.endDate ? now : c.endDate, reason: "" });
                setExitOpen(true);
              }}
            >
              {t("EarlyExit")}
            </Button>
          )}
        </Space>
      </div>

      {/* طباعة فاتورة الدفعة (A4): بعد الإصدار أو من زرار الطباعة */}
      <SavedDocPrint job={printJob} onClose={() => setPrintJob(null)} />

      {/* موقف العقد */}
      <Row gutter={[12, 12]} className="mb-3">
        {[
          { k: "ContractTotal", v: c.totalAmount, hint: t("BeforeTax") },
          { k: "Invoiced", v: pos.invoiced, hint: t("WithTax") },
          { k: "Collected", v: pos.collected, color: C.successText },
          { k: "OutstandingOnInvoices", v: pos.outstanding, color: pos.outstanding > 0 ? C.dangerText : undefined },
          { k: "NotInvoicedYet", v: pos.notInvoiced, hint: t("BeforeTax") },
        ].map((x) => (
          <Col xs={12} md={8} lg={4} key={x.k} flex="1">
            <Card size="small">
              <Statistic
                title={
                  <span>
                    {t(x.k)}
                    {x.hint && <span className="text-xs text-slate-400"> ({x.hint})</span>}
                  </span>
                }
                value={money(x.v)}
                styles={x.color ? { content: { color: x.color } } : undefined}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[12, 12]} className="mb-3">
        <Col xs={24} lg={14}>
          <Card size="small" className="h-full">
            <Descriptions
              size="small"
              column={{ xs: 1, md: 2 }}
              items={[
                {
                  key: "t",
                  label: t("Tenant"),
                  children: (
                    <span>
                      {nameOf(c.customer)} {c.customer.phone && <bdi className="text-slate-500">({c.customer.phone})</bdi>}
                    </span>
                  ),
                },
                { key: "e", label: t("EjarNo"), children: c.ejarNo ? <bdi>{c.ejarNo}</bdi> : "—" },
                {
                  key: "p",
                  label: t("Period"),
                  children: (
                    <bdi>
                      {formatDay(c.startDate)} - {formatDay(c.endDate)}
                    </bdi>
                  ),
                },
                { key: "pe", label: t("PayEvery"), children: t(`every_${c.payEvery}`) },
                { key: "tot", label: t("ContractTotal"), children: <b>{money(c.totalAmount)}</b> },
                { key: "b", label: t("Branch"), children: nameOf(c.branch) },
                ...(c.status === "terminated"
                  ? [
                      { key: "x", label: t("ExitDate"), children: formatDay(c.exitDate) },
                      { key: "xr", label: t("ExitReason"), children: c.exitReason || "—" },
                    ]
                  : []),
                ...(c.renewedFrom
                  ? [
                      {
                        key: "rf",
                        label: t("RenewedFrom"),
                        children: (
                          <Link href={`/real-estate/contracts/${c.renewedFrom.id}`}>
                            <bdi>{c.renewedFrom.docNo}</bdi>
                          </Link>
                        ),
                      },
                    ]
                  : []),
                ...(c.renewals.length
                  ? [
                      {
                        key: "rn",
                        label: t("RenewedTo"),
                        children: c.renewals.map((r) => (
                          <Link key={r.id} href={`/real-estate/contracts/${r.id}`} className="me-2">
                            <bdi>{r.docNo}</bdi>
                          </Link>
                        )),
                      },
                    ]
                  : []),
                ...(c.notes ? [{ key: "n", label: t("Notes"), children: c.notes, span: 2 }] : []),
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title={t("ContractUnits")} className="h-full">
            <Table
              size="small"
              bordered
              rowKey="id"
              pagination={false}
              dataSource={c.units}
              columns={[
                {
                  title: t("Unit"),
                  key: "u",
                  render: (_, u) => `${u.property.name} - ${t(`kind_${u.kind}`)} ${u.unitNo}`,
                },
                { title: t("UseType"), key: "ut", width: 80, align: "center", render: (_, u) => t(`use_${u.useType}`) },
                { title: t("AnnualRent"), dataIndex: "annualRent", width: 120, align: "end", render: (v) => money(v) },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title={t("Installments")}>
        <Table
          size="small"
          bordered
          rowKey="id"
          pagination={false}
          dataSource={c.installments}
          scroll={{ x: 900 }}
          onRow={(i) => (i.status === "cancelled" ? { style: { color: C.text2 } } : {})}
          columns={[
            { title: "#", dataIndex: "seq", width: 50, align: "center" },
            {
              title: t("Period"),
              key: "p",
              width: 200,
              render: (_, i) => (
                <bdi>
                  {formatDay(i.periodFrom)} - {formatDay(i.periodTo)}
                </bdi>
              ),
            },
            { title: t("DueDate"), dataIndex: "dueDate", width: 110, render: (v) => formatDay(v) },
            { title: t("AmountBeforeTax"), dataIndex: "amount", width: 130, align: "end", render: (v) => money(v) },
            { title: t("Status"), key: "s", width: 110, align: "center", render: (_, i) => instStatus(i) },
            {
              title: t("Invoice"),
              key: "inv",
              width: 260,
              render: (_, i) =>
                i.sale ? (
                  <Space size={8} wrap>
                    <Link href={`/invoices/sales/${i.sale.id}`}>
                      <bdi className="font-bold">{saleDocNo(i.sale.type, i.sale.number, i.sale.docCode)}</bdi>
                    </Link>
                    <span>{money(i.sale.totalAmount)}</span>
                    {i.sale.remainingAmount > 0 ? (
                      <Tag color="orange">
                        {t("Remaining")} {money(i.sale.remainingAmount)}
                      </Tag>
                    ) : (
                      <Tag color="green">{t("Paid")}</Tag>
                    )}
                    <Button
                      size="small"
                      icon={<PrinterOutlined />}
                      title={t("PrintInvoice")}
                      onClick={() => printInvoice(i.sale.id, true)}
                    />
                    {perms.editInvoice && !i.sale.locked && (
                      <Button size="small" icon={<EditOutlined />} title={t("EditInvoice")} onClick={() => setEditFor(i)} />
                    )}
                    {perms.cancelInvoice && !i.sale.locked && (
                      <Popconfirm
                        title={t("CancelInvoiceConfirm")}
                        description={t("CancelInvoiceHint")}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => cancelInvoice(i)}
                      >
                        <Button size="small" danger icon={<StopOutlined />} title={t("CancelInvoice")} />
                      </Popconfirm>
                    )}
                  </Space>
                ) : i.status === "due" && perms.invoice ? (
                  <Button size="small" type="primary" icon={<FileDoneOutlined />} onClick={() => setInvFor(i)}>
                    {t("IssueInvoice")}
                  </Button>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </Card>

      {/* فاتورة الدفعة: مدفوعة بالكامل / سداد جزئي / آجل ← بعدها شريط الطباعة A4 */}
      <IssueInvoiceModal
        inst={invFor}
        paymentMethods={paymentMethods}
        onClose={() => setInvFor(null)}
        onDone={(saleId) => printInvoice(saleId, true)}
      />
      <IssueInvoiceModal
        edit
        inst={editFor}
        paymentMethods={paymentMethods}
        onClose={() => setEditFor(null)}
        onDone={(saleId) => printInvoice(saleId, true)}
      />

      {/* الخروج المبكر */}
      {/* النافذة في المتصفح بس (forceRender من غير hydration error) */}
      <ClientOnly>
        <Modal
          open={exitOpen}
          title={t("EarlyExit")}
          onCancel={() => setExitOpen(false)}
          onOk={() => exitForm.submit()}
          okButtonProps={{ danger: true }}
          okText={t("ConfirmExit")}
          forceRender
        >
          <p className="mb-3 text-slate-600">{t("EarlyExitHint")}</p>
          <Form form={exitForm} layout="vertical" autoComplete="off" onFinish={terminate}>
            <Row gutter={[12, 0]}>
              <Col xs={24} md={10}>
                <Form.Item name="exitDate" label={t("ExitDate")} rules={[{ required: true, message: tAlerts("RequiredField") }]}>
                  <DayPicker min={c.startDate} />
                </Form.Item>
              </Col>
              <Col xs={24} md={14}>
                <Form.Item name="reason" label={t("ExitReason")}>
                  <Input maxLength={255} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Modal>
      </ClientOnly>

      {/* طباعة العقد: النص المحفوظ */}
      {printing && (
        <PrintDocument paperSize="A4" onDone={() => setPrinting(false)}>
          <div dir={locale === "ar" ? "rtl" : "ltr"} style={{ padding: "12mm", fontSize: "11pt", lineHeight: 1.9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4mm", marginBottom: "6mm" }}>
              {company?.logo && <img src={imageUrl(company.logo)} alt="" style={{ height: "18mm" }} />}
              <div style={{ fontWeight: 700, fontSize: "14pt" }}>
                {locale === "ar" ? company?.arName : company?.enName}
              </div>
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{c.content}</div>
          </div>
        </PrintDocument>
      )}
    </div>
  );
}
