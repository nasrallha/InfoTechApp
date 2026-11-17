"use client";

import { useState } from "react";
import { Button, Card, Col, Input, Popconfirm, Row, Select, Space, Table, Tag } from "antd";
import {
  EditOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  PlusOutlined,
  PrinterOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import DayPicker from "@/components/common/DayPicker";
import FiscalYearPicker from "@/components/common/FiscalYearPicker";
import ExportButtons from "@/components/reports/ExportButtons";
import PrintDocument from "@/components/printing/PrintDocument";
import PdfDocument from "@/components/printing/PdfDocument";
import { cancelCertificateAction, exportCertificatesAction, getCertificateAction } from "@/actions/contracting.actions";
import { formatDay } from "@/lib/dates";
import { C } from "@/lib/theme";
import CertificatePrint from "./CertificatePrint";
import { PaymentModal } from "./ContractModals";
import { exportCertificateExcel } from "./certificateExcel";
import EditCertificateModal from "./EditCertificateModal";

// ============================================================
// المستخلصات (تقرير عام): كل المستخلصات - عقود المالك ومقاولي الباطن والسريعة
// - رقم المستخلص والتاريخ والطرف والعقد والأعمال والاسترداد والضريبة والفاتورة والضمان والصافي
//   ورقم الفاتورة والمتبقي عليها + طباعة / PDF / Excel / إلغاء بمرتجع لكل مستخلص
// - الفلتر: بحث (Enter أو الزرار) + من / إلى + النوع، والإجماليات من غير الملغي
// - تصدير التقرير كله Excel / PDF / طباعة
// - الضمان المحجوز من المستخلصات السريعة عند كل عميل + الإفراج عنه (سند قبض)
// filters: { q, from, to, kind }
// ============================================================
export default function CertificatesList({ data, filters, perms, paymentMethods = [], units = [] }) {
  const t = useTranslations("Contracting");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { amount: money } = useCurrency();
  const [search, setSearch] = useState(filters.q ?? "");
  const [busy, setBusy] = useState(null);
  const [docJob, setDocJob] = useState(null);
  const [release, setRelease] = useState(null); // حساب العميل للإفراج عن الضمان
  const [editCert, setEditCert] = useState(null); // رقم المستخلص اللي بيتعدل
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName || x.arName) : "");

  const go = (patch) => {
    const next = { ...filters, q: search.trim(), page: 1, ...patch };
    const sp = new URLSearchParams();
    if (next.q) sp.set("q", next.q);
    if (next.from) sp.set("from", next.from);
    if (next.to) sp.set("to", next.to);
    if (next.kind && next.kind !== "all") sp.set("kind", next.kind);
    if (next.page > 1) sp.set("page", String(next.page));
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const certDoc = async (r, mode) => {
    setBusy(`${mode}-${r.id}`);
    const res = await getCertificateAction(r.id);
    setBusy(null);
    if (!res.success || !res.data) return showActionError(res, tAlerts, locale);
    if (mode === "excel") return exportCertificateExcel(res.data, t, { locale, invoiceNo: r.invoice?.docNo });
    setDocJob({ mode, cert: res.data });
  };

  const cancel = async (id) => {
    const res = await cancelCertificateAction(id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("CertCancelledDone"));
  };

  const kindLabel = (k) => (k === "quick" ? t("KindQuick") : k === "sub" ? t("KindSub") : t("KindOwner"));

  const columns = [
    {
      title: t("CertNo"),
      dataIndex: "docNo",
      width: 120,
      render: (v, r) => (
        <div>
          <bdi className="font-bold">{v}</bdi>
          {r.cancelled && (
            <div>
              <Tag color="red">{t("CertCancelledTag")}</Tag>
            </div>
          )}
        </div>
      ),
    },
    { title: t("CertDate"), dataIndex: "date", width: 100, render: (v) => formatDay(v) },
    { title: t("Party"), key: "p", width: 180, render: (_, r) => nameOf(r.party) },
    {
      title: t("ContractOrType"),
      key: "k",
      width: 180,
      render: (_, r) =>
        r.contract ? (
          <div>
            <Link href={`/contracting/${r.contract.id}`}>
              <bdi>{r.contract.docNo}</bdi>
            </Link>
            <div className="text-xs text-slate-500">{r.contract.projectName}</div>
          </div>
        ) : (
          <Tag className="cp-chip">{kindLabel(r.kind)}</Tag>
        ),
    },
    { title: t("ClientRef"), dataIndex: "clientRef", width: 110, render: (v) => (v ? <bdi>{v}</bdi> : "—") },
    { title: t("Works"), dataIndex: "gross", width: 120, align: "end", render: (v) => money(v) },
    { title: t("AdvanceRecovery"), dataIndex: "recovery", width: 115, align: "end", render: (v) => (v ? money(v) : "—") },
    { title: t("Vat"), dataIndex: "taxAmount", width: 110, align: "end", render: (v) => money(v) },
    { title: t("InvoiceTotal"), dataIndex: "invoiceTotal", width: 125, align: "end", render: (v) => <b>{money(v)}</b> },
    { title: t("Retention"), dataIndex: "retention", width: 110, align: "end", render: (v) => (v ? money(v) : "—") },
    { title: t("NetPayable"), dataIndex: "netPayable", width: 125, align: "end", render: (v) => <b>{money(v)}</b> },
    {
      title: t("Invoice"),
      key: "inv",
      width: 190,
      render: (_, r) =>
        r.invoice ? (
          <Space size={4} wrap>
            <Link href={r.invoice.sub ? `/invoices/purchases/${r.invoice.id}` : `/invoices/sales/${r.invoice.id}`}>
              <bdi className="font-bold">{r.invoice.docNo}</bdi>
            </Link>
            {r.invoice.remaining > 0 ? (
              <Tag color="orange">
                {t("Remaining")} {money(r.invoice.remaining)}
              </Tag>
            ) : (
              <Tag color="green">{t("Paid")}</Tag>
            )}
          </Space>
        ) : (
          "—"
        ),
    },
    {
      title: "",
      key: "a",
      width: 190,
      align: "center",
      render: (_, r) => (
        <Space size={4}>
          <Button
            size="small"
            aria-label={t("PrintCertificate")}
            title={t("PrintCertificate")}
            icon={<PrinterOutlined />}
            loading={busy === `print-${r.id}`}
            onClick={() => certDoc(r, "print")}
          />
          <Button
            size="small"
            danger
            aria-label={t("CertificatePdf")}
            title={t("CertificatePdf")}
            icon={<FilePdfOutlined />}
            loading={busy === `pdf-${r.id}`}
            onClick={() => certDoc(r, "pdf")}
          />
          <Button
            size="small"
            aria-label={t("CertificateExcel")}
            title={t("CertificateExcel")}
            icon={<FileExcelOutlined />}
            style={{ color: C.success }}
            loading={busy === `excel-${r.id}`}
            onClick={() => certDoc(r, "excel")}
          />
          {perms.editInvoice && !r.cancelled && r.invoice && (
            <Button size="small" aria-label={t("EditCertificate")} title={t("EditCertificate")} icon={<EditOutlined />} onClick={() => setEditCert(r.id)} />
          )}
          {perms.cancelInvoice && !r.cancelled && r.invoice && (
            <Popconfirm
              title={t("CancelCertConfirm")}
              description={t("CancelCertHint")}
              okButtonProps={{ danger: true }}
              onConfirm={() => cancel(r.id)}
            >
              <Button size="small" danger aria-label={t("CancelCertificate")} title={t("CancelCertificate")} icon={<RollbackOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // تصدير التقرير كله (كل الصفوف بنفس الفلتر)
  const period =
    filters.from || filters.to
      ? `${filters.from ? formatDay(filters.from) : "…"} - ${filters.to ? formatDay(filters.to) : "…"}`
      : t("AllPeriods");
  const loadAll = async () => {
    const res = await exportCertificatesAction({
      q: filters.q ?? "",
      from: filters.from || null,
      to: filters.to || null,
      kind: filters.kind ?? "all",
    });
    if (!res.success) {
      showActionError(res, tAlerts, locale);
      return null;
    }
    return res.data;
  };
  const buildReport = (all) => ({
    title: t("AllCertificates"),
    fileName: t("AllCertificates"),
    info: [
      [t("Period"), period],
      [t("CertKind"), filters.kind && filters.kind !== "all" ? kindLabel(filters.kind) : t("KindAll")],
      ...(filters.q ? [[t("Search"), filters.q]] : []),
    ],
    columns: [
      { title: t("CertNo"), key: "docNo", type: "text", width: 14 },
      { title: t("CertDate"), key: "date", type: "text", width: 12 },
      { title: t("Party"), key: "party", type: "text", width: 26 },
      { title: t("ContractOrType"), key: "contract", type: "text", width: 22 },
      { title: t("ClientRef"), key: "clientRef", type: "text", width: 14 },
      { title: t("Works"), key: "gross", type: "money" },
      { title: t("AdvanceRecovery"), key: "recovery", type: "money" },
      { title: t("Vat"), key: "taxAmount", type: "money" },
      { title: t("InvoiceTotal"), key: "invoiceTotal", type: "money" },
      { title: t("Retention"), key: "retention", type: "money" },
      { title: t("NetPayable"), key: "netPayable", type: "money" },
      { title: t("Invoice"), key: "invoice", type: "text", width: 14 },
      { title: t("Remaining"), key: "remaining", type: "money" },
    ],
    rows: all.rows.map((r) => ({
      key: r.id,
      docNo: r.cancelled ? `${r.docNo} (${t("CertCancelledTag")})` : r.docNo,
      date: formatDay(r.date),
      party: nameOf(r.party),
      contract: r.contract ? `${r.contract.docNo} - ${r.contract.projectName}` : kindLabel(r.kind),
      clientRef: r.clientRef ?? "",
      gross: r.gross,
      recovery: r.recovery,
      taxAmount: r.taxAmount,
      invoiceTotal: r.invoiceTotal,
      retention: r.retention,
      netPayable: r.netPayable,
      invoice: r.invoice?.docNo ?? "",
      remaining: r.invoice?.remaining ?? 0,
    })),
    totals: all.totals,
  });

  const retentionColumns = [
    { title: t("Owner"), key: "c", width: 220, render: (_, a) => nameOf(a.customer) },
    { title: t("RetentionHeld"), dataIndex: "held", width: 130, align: "end", render: (v) => money(v) },
    { title: t("Released"), dataIndex: "released", width: 130, align: "end", render: (v) => money(v) },
    { title: t("RetentionLeft"), dataIndex: "left", width: 130, align: "end", render: (v) => <b>{money(v)}</b> },
    {
      title: "",
      key: "a",
      width: 150,
      align: "center",
      render: (_, a) =>
        perms.payments && (
          <Button size="small" icon={<SafetyCertificateOutlined />} onClick={() => setRelease(a)}>
            {t("ReleaseRetention")}
          </Button>
        ),
    },
  ];

  const tot = data.totals;
  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{t("AllCertificates")}</h1>
        <Space wrap>
          <ExportButtons build={buildReport} loadAll={loadAll} disabled={!data.total} />
          {perms.invoice && (
            <Link href="/contracting/quick/new">
              <Button type="primary" icon={<PlusOutlined />}>
                {t("NewQuickCertificate")}
              </Button>
            </Link>
          )}
        </Space>
      </div>

      <Card size="small" className="mb-3">
        <Row gutter={[12, 8]} align="bottom" className="cp-filters">
          <Col xs={24} md={9}>
            <Space.Compact style={{ width: "100%" }}>
              <Input
                allowClear
                autoComplete="off"
                value={search}
                placeholder={t("CertSearch")}
                onChange={(e) => setSearch(e.target.value)}
                onPressEnter={() => go({})}
              />
              <Button type="primary" icon={<SearchOutlined />} onClick={() => go({})} aria-label={t("Search")} title={t("Search")} />
            </Space.Compact>
          </Col>
          {/* السنة المالية ← من / إلى بتواريخها */}
          <Col xs={12} md={3}>
            <FiscalYearPicker label={false} style={{ width: "100%" }} onPick={(from, to) => go({ from, to })} />
          </Col>
          <Col xs={12} md={3}>
            <DayPicker allowClear placeholder={t("From")} value={filters.from || null} onChange={(v) => go({ from: v || null })} />
          </Col>
          <Col xs={12} md={4}>
            <DayPicker allowClear placeholder={t("To")} value={filters.to || null} onChange={(v) => go({ to: v || null })} />
          </Col>
          <Col xs={24} md={7}>
            <Select
              style={{ width: "100%" }}
              value={filters.kind ?? "all"}
              onChange={(v) => go({ kind: v })}
              options={[
                { value: "all", label: t("KindAll") },
                { value: "owner", label: t("KindOwner") },
                { value: "sub", label: t("KindSub") },
                { value: "quick", label: t("KindQuick") },
              ]}
            />
          </Col>
        </Row>
      </Card>

      <Table
        size="small"
        rowKey="id"
        dataSource={data.rows}
        columns={columns}
        scroll={{ x: columns.reduce((s, c) => s + c.width, 0) }}
        pagination={{
          current: data.page,
          pageSize: data.pageSize,
          total: data.total,
          showSizeChanger: false,
          onChange: (page) => go({ page }),
        }}
        summary={() =>
          data.total > 0 && (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={5}>
                <b>{t("TotalExclCancelled")}</b>
              </Table.Summary.Cell>
              {["gross", "recovery", "taxAmount", "invoiceTotal", "retention", "netPayable"].map((k, i) => (
                <Table.Summary.Cell key={k} index={5 + i} align="end">
                  <b>{money(tot[k])}</b>
                </Table.Summary.Cell>
              ))}
              <Table.Summary.Cell index={11} colSpan={2} />
            </Table.Summary.Row>
          )
        }
      />

      {/* الضمان المحجوز من المستخلصات السريعة (المستخلصات اللي على عقد: من شاشة العقد) */}
      {data.retentions.length > 0 && (
        <Card size="small" className="mt-3" title={t("QuickRetentions")}>
          <Table
            size="small"
            rowKey="contractId"
            pagination={false}
            dataSource={data.retentions}
            columns={retentionColumns}
            scroll={{ x: retentionColumns.reduce((s, c) => s + c.width, 0) }}
          />
        </Card>
      )}

      {editCert && (
        <EditCertificateModal certId={editCert} methods={paymentMethods} units={units} onClose={() => setEditCert(null)} />
      )}
      {/* الإفراج عن الضمان (سند قبض) على حساب المستخلصات السريعة للعميل */}
      {release && (
        <PaymentModal
          contract={{
            id: release.contractId,
            kind: "owner",
            position: { retentionLeft: release.left, due: release.left },
          }}
          methods={paymentMethods}
          initialKind="retention"
          onClose={() => {
            setRelease(null);
            router.refresh();
          }}
        />
      )}

      {docJob?.mode === "print" && (
        <PrintDocument paperSize="A4" onDone={() => setDocJob(null)}>
          <CertificatePrint cert={docJob.cert} />
        </PrintDocument>
      )}
      {docJob?.mode === "pdf" && (
        <PdfDocument paperSize="A4" fileName={`certificate-${docJob.cert.docNo}`} onDone={() => setDocJob(null)}>
          <CertificatePrint cert={docJob.cert} />
        </PdfDocument>
      )}
    </div>
  );
}
