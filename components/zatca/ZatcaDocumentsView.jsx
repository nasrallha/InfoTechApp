"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Col,
  Popover,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from "antd";
import {
  CloudUploadOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  ReloadOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { message } from "@/components/common/feedback";
import { downloadBlob } from "@/lib/excel";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PageHeader from "@/components/common/PageHeader";
import DayPicker from "@/components/common/DayPicker";
import ExportButtons from "@/components/reports/ExportButtons";
import {
  getZatcaXmlAction,
  listZatcaDocumentsAction,
  sendAllPendingAction,
  sendZatcaInvoiceAction,
} from "@/actions/zatca.actions";
import {
  DOC_STATUS_COLOR,
  EnvTag,
  showZatcaError,
  showZatcaResult,
} from "./zatcaUi";
import { C } from "@/lib/theme";
import "@/components/common/table.css";
import "./zatca.css";

const STATUSES = ["pending", "reported", "cleared", "rejected", "error"];

// ============================================================
// متابعة الفواتير الإلكترونية + تقرير الفواتير المرفوعة للهيئة
// ============================================================
export default function ZatcaDocumentsView({
  initialFilters,
  initialData,
  branches = [],
  canSend,
  canExport,
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const locale = useLocale();
  const t = useTranslations("Zatca");
  const tAlerts = useTranslations("Alerts");
  const { amount: money } = useCurrency();
  const router = useRouter();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const load = async (next = filters) => {
    setFilters(next);
    setLoading(true);
    const res = await listZatcaDocumentsAction(next);
    setLoading(false);
    if (!res.success) return showZatcaError(res, { t, tAlerts, locale });
    setData(res.data);
  };
  const set = (patch) => load({ ...filters, ...patch });

  const sendOne = async (row) => {
    setBusy(row.id);
    const res = await sendZatcaInvoiceAction({ saleId: row.saleId });
    setBusy(null);
    if (!res.success) return showZatcaError(res, { t, tAlerts, locale });
    showZatcaResult(res.data, { t });
    load();
  };

  const sendAll = async () => {
    setBusy("all");
    const res = await sendAllPendingAction();
    setBusy(null);
    if (!res.success) return showZatcaError(res, { t, tAlerts, locale });
    const r = res.data ?? {};
    if (r.skipped) message.info(t("QueueBusy"));
    else
      message.success(
        t("QueueDone", { sent: r.sent ?? 0, failed: r.failed ?? 0 }),
      );
    load();
  };

  const downloadXml = async (row) => {
    setBusy(`xml-${row.id}`);
    const res = await getZatcaXmlAction({ saleId: row.saleId });
    setBusy(null);
    if (!res.success) return showZatcaError(res, { t, tAlerts, locale });
    downloadBlob(
      new Blob([res.data.xml], { type: "application/xml" }),
      res.data.fileName,
    );
  };

  // الضريبية قبل الاعتماد: مفيش ملف رسمي لسه
  const exportable = (r) => !(r.kind === "standard" && r.status !== "cleared");

  const linkOf = (r) =>
    r.saleType === "return"
      ? `/invoices/sales-returns/${r.saleId}`
      : `/invoices/sales/${r.saleId}`;

  const columns = [
    {
      title: t("DocNo"),
      key: "no",
      render: (_, r) => (
        <Link href={linkOf(r)}>
          <bdi>{r.docNo}</bdi>
        </Link>
      ),
    },
    {
      title: t("Date"),
      dataIndex: "date",
      render: (v) => formatDateTime(v),
    },
    {
      title: t("Customer"),
      key: "customer",
      render: (_, r) => nm(r.customer) || t("CashCustomer"),
    },
    {
      title: t("Type"),
      key: "type",
      render: (_, r) => (
        <Space size={4} wrap>
          <Tag color={r.kind === "standard" ? "purple" : "blue"}>
            {t(`kind.${r.kind}`)}
          </Tag>
          <Tag>{t(`docType.${r.docType}`)}</Tag>
        </Space>
      ),
    },
    ...(branches.length
      ? [{ title: t("Branch"), key: "branch", render: (_, r) => nm(r.branch) }]
      : []),
    { title: "ICV", dataIndex: "icv", align: "center" },
    {
      title: t("NetAmount"),
      dataIndex: "net",
      align: "end",
      render: (v) => money(v),
    },
    {
      title: t("TaxAmount"),
      dataIndex: "tax",
      align: "end",
      render: (v) => money(v),
    },
    {
      title: t("Total"),
      dataIndex: "total",
      align: "end",
      render: (v) => <b>{money(v)}</b>,
    },
    {
      title: t("Status"),
      key: "status",
      render: (_, r) => {
        const msgs = [
          ...r.errors.map((m) => ({ ...m, type: "error" })),
          ...r.warnings.map((m) => ({ ...m, type: "warning" })),
        ];
        const tag = (
          <Tag color={DOC_STATUS_COLOR[r.status]}>
            {t(`docStatus.${r.status}`)}
            {msgs.length > 0 && <WarningOutlined className="ms-1" />}
          </Tag>
        );
        return msgs.length ? (
          <Popover
            title={t("Messages")}
            content={
              <ul className="zatca-msgs">
                {msgs.map((m, i) => (
                  <li key={i} className={`zatca-msg zatca-msg--${m.type}`}>
                    {[m.code, m.message].filter(Boolean).join(": ")}
                  </li>
                ))}
              </ul>
            }
          >
            {tag}
          </Popover>
        ) : (
          tag
        );
      },
    },
    {
      title: t("Environment"),
      dataIndex: "environment",
      responsive: ["lg"],
      render: (v) => <EnvTag env={v} t={t} />,
    },
    {
      title: "",
      key: "actions",
      render: (_, r) => (
        <Space size={4}>
          {/* عرض الفاتورة (ومنها الطباعة) */}
          <Tooltip title={t("ViewInvoice")}>
            <Link href={linkOf(r)}>
              <Button aria-label={t("ViewInvoice")} title={t("ViewInvoice")} size="small" icon={<EyeOutlined />} />
            </Link>
          </Tooltip>
          {canExport && exportable(r) && (
            <>
              <Tooltip title={t("DownloadXml")}>
                <Button
                  size="small"
                  icon={<FileTextOutlined />}
                  loading={busy === `xml-${r.id}`}
                  onClick={() => downloadXml(r)}
                />
              </Tooltip>
              <Tooltip title={t("DownloadPdfA3")}>
                <Button
                  size="small"
                  icon={<FilePdfOutlined style={{ color: C.dangerText }} />}
                  onClick={() => router.push(`${linkOf(r)}?zatca=pdf`)}
                />
              </Tooltip>
            </>
          )}
          {canSend && ["pending", "error", "rejected"].includes(r.status) && (
            <Tooltip title={t("Resend")}>
              <Button
                size="small"
                icon={<CloudUploadOutlined />}
                loading={busy === r.id}
                onClick={() => sendOne(r)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // التصدير (Excel / طباعة / PDF)
  const build = () => ({
    title: t("DocumentsTitle"),
    info: [
      [t("From"), filters.from],
      [t("To"), filters.to],
      ...(filters.status
        ? [[t("Status"), t(`docStatus.${filters.status}`)]]
        : []),
    ],
    summary: [
      [t("AcceptedCount"), String(data.totals.acceptedCount)],
      [t("NetAmount"), money(data.totals.net)],
      [t("TaxAmount"), money(data.totals.tax)],
      [t("Total"), money(data.totals.total), true],
    ],
    columns: [
      { title: t("DocNo"), key: "docNo", type: "text", width: 12 },
      { title: t("Date"), key: "date", type: "text", width: 18 },
      { title: t("Customer"), key: "customer", type: "text", width: 26 },
      { title: t("Type"), key: "type", type: "text", width: 22 },
      { title: "ICV", key: "icv", type: "number", width: 8 },
      { title: t("NetAmount"), key: "net", type: "money" },
      { title: t("TaxAmount"), key: "tax", type: "money" },
      { title: t("Total"), key: "total", type: "money" },
      { title: t("Status"), key: "status", type: "text", width: 14 },
    ],
    rows: data.rows.map((r) => ({
      key: r.id,
      docNo: r.docNo,
      date: formatDateTime(r.date),
      customer: nm(r.customer) || t("CashCustomer"),
      type: `${t(`kind.${r.kind}`)} - ${t(`docType.${r.docType}`)}`,
      icv: r.icv,
      net: r.net,
      tax: r.tax,
      total: r.total,
      status: t(`docStatus.${r.status}`),
    })),
    totals: {
      net: data.rows.reduce((s, r) => s + r.net, 0),
      tax: data.rows.reduce((s, r) => s + r.tax, 0),
      total: data.rows.reduce((s, r) => s + r.total, 0),
    },
  });

  const open =
    (data.byStatus.pending?.count ?? 0) + (data.byStatus.error?.count ?? 0);

  return (
    <>
      <PageHeader
        title={t("DocumentsTitle")}
        extra={
          <Space wrap>
            {canSend && (
              <Button
                type="primary"
                icon={<CloudUploadOutlined />}
                loading={busy === "all"}
                disabled={!open && !data.unsigned}
                onClick={sendAll}
              >
                {t("SendAllPending")}
              </Button>
            )}
            <ExportButtons build={build} disabled={!data.rows.length} />
          </Space>
        }
      />

      <Card size="small" className="mb-3">
        <Row gutter={[12, 12]} align="bottom">
          <Col xs={12} md={4}>
            <div className="zatca-muted">{t("From")}</div>
            <DayPicker
              value={filters.from}
              max={filters.to}
              onChange={(v) => v && set({ from: v })}
            />
          </Col>
          <Col xs={12} md={4}>
            <div className="zatca-muted">{t("To")}</div>
            <DayPicker
              value={filters.to}
              min={filters.from}
              onChange={(v) => v && set({ to: v })}
            />
          </Col>
          {branches.length > 0 && (
            <Col xs={24} md={4}>
              <div className="zatca-muted">{t("Branch")}</div>
              <Select
                allowClear
                style={{ width: "100%" }}
                value={filters.branchId ?? undefined}
                onChange={(v) => set({ branchId: v ?? null })}
                options={branches.map((b) => ({ value: b.id, label: nm(b) }))}
              />
            </Col>
          )}
          <Col xs={12} md={4}>
            <div className="zatca-muted">{t("Status")}</div>
            <Select
              allowClear
              style={{ width: "100%" }}
              value={filters.status ?? undefined}
              onChange={(v) => set({ status: v ?? null })}
              options={STATUSES.map((s) => ({
                value: s,
                label: t(`docStatus.${s}`),
              }))}
            />
          </Col>
          <Col xs={12} md={4}>
            <div className="zatca-muted">{t("Type")}</div>
            <Select
              allowClear
              style={{ width: "100%" }}
              value={filters.kind ?? undefined}
              onChange={(v) => set({ kind: v ?? null })}
              options={["simplified", "standard"].map((k) => ({
                value: k,
                label: t(`kind.${k}`),
              }))}
            />
          </Col>
          <Col xs={24} md={4}>
            <Button icon={<ReloadOutlined />} onClick={() => load()}>
              {t("Refresh")}
            </Button>
          </Col>
        </Row>
      </Card>

      {/* ملخص لكل حالة */}
      <div className="zatca-stats">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`zatca-stat ${filters.status === s ? "is-active" : ""}`}
            onClick={() => set({ status: filters.status === s ? null : s })}
          >
            <Tag color={DOC_STATUS_COLOR[s]}>{t(`docStatus.${s}`)}</Tag>
            <b>{data.byStatus[s]?.count ?? 0}</b>
            <span className="zatca-muted">
              {money(data.byStatus[s]?.total ?? 0)}
            </span>
          </button>
        ))}
        <div className="zatca-stat zatca-stat--total">
          <span>{t("AcceptedTotals")}</span>
          <b>{money(data.totals.total)}</b>
          <span className="zatca-muted">
            {t("TaxAmount")}: {money(data.totals.tax)}
          </span>
        </div>
      </div>
      {data.unsigned > 0 && (
        <div className="zatca-unsigned">
          <WarningOutlined /> {t("UnsignedCount", { count: data.unsigned })}
        </div>
      )}

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={data.rows}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        scroll={{ x: "max-content" }}
      />
    </>
  );
}
