"use client";

import { useState } from "react";
import { Alert, Button, Card, Col, Row, Segmented, Select, Space, Statistic, Table, Tabs, Tag } from "antd";
import { FileDoneOutlined, PrinterOutlined, SearchOutlined } from "@ant-design/icons";
import SavedDocPrint from "@/components/printing/SavedDocPrint";
import { SAVE_PRINT_A4 } from "@/lib/print-param";
import IssueInvoiceModal from "./IssueInvoiceModal";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import PageHeader from "@/components/common/PageHeader";
import DayPicker from "@/components/common/DayPicker";
import ExportButtons from "@/components/reports/ExportButtons";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { formatDate, formatDay, today } from "@/lib/dates";
import { addDays, addMonths } from "@/lib/rent";
import { C } from "@/lib/theme";
import { CONTRACT_STATUS_COLOR } from "./ContractsList";

// ============================================================
// تقارير تأجير العقارات (الفلاتر في الرابط)
// الوحدات | الاستحقاقات | فواتير الإيجار والضريبة | العقود المنتهية | كشف حساب المالك | تقرير المستأجر
// ============================================================
const TABS = ["dues", "invoices", "units", "expiring", "owner", "tenant"];
const STATUS_OPTIONS = {
  units: ["all", "available", "rented"],
  dues: ["due", "overdue", "invoiced", "all"],
};

export default function RentReportsView({ tab, data, filters, options, canInvoice = false, paymentMethods = [] }) {
  const t = useTranslations("RealEstate");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { amount: money } = useCurrency();
  const [f, setF] = useState(filters);
  // الاستحقاقات: إصدار فاتورة الدفعة من التقرير + طباعتها A4
  const [invFor, setInvFor] = useState(null);
  const [printJob, setPrintJob] = useState(null);
  const printInvoice = (saleId, auto) =>
    setPrintJob({
      kind: "sale",
      id: saleId,
      paper: "A4",
      mode: auto ? SAVE_PRINT_A4 : null,
      text: t("InvoiceReadyToPrint"),
      seq: Date.now(),
    });
  const now = today();
  const nameOf = (c) => (c ? (locale === "ar" ? c.arName : c.enName || c.arName) : "");
  const unitsText = (units) =>
    units.map((u) => `${u.property} - ${t(`kind_${u.kind}`)} ${u.unitNo}`).join("، ");

  const go = (next, nextTab = tab) => {
    const q = new URLSearchParams({ tab: nextTab });
    if (nextTab === tab) {
      if (next.from) q.set("from", next.from);
      if (next.to) q.set("to", next.to);
      if (next.status) q.set("status", next.status);
    }
    if (next.ownerId) q.set("owner", String(next.ownerId));
    if (next.propertyId) q.set("property", String(next.propertyId));
    if (next.customerId) q.set("customer", String(next.customerId));
    router.push(`${pathname}?${q}`);
  };

  // فترات سريعة: الشهر الحالي / الشهر الجاي / خلال 7 / 30 يوم
  const month = (k) => {
    const start = addMonths(`${now.slice(0, 7)}-01`, k);
    return { from: start, to: addDays(addMonths(start, 1), -1) };
  };
  const quick = [
    { key: "thisMonth", ...month(0) },
    { key: "nextMonth", ...month(1) },
    { key: "next7", from: now, to: addDays(now, 7) },
    { key: "next30", from: now, to: addDays(now, 30) },
  ];

  const showPeriod = tab !== "units" && tab !== "tenant" && !(tab === "dues" && f.status === "overdue");
  // تقرير المستأجر: البحث بالاسم / الجوال / الهوية / الرقم الضريبي / الكود
  const tenantLabel = (c) => [c.code, nameOf(c), c.phone, c.idNumber, c.taxNo].filter(Boolean).join(" - ");
  const filterBar = (
    <Card size="small" className="mb-3">
      <Space wrap align="end" size={[8, 8]}>
        {showPeriod && (
          <>
            <div>
              <div className="text-xs text-slate-500 mb-1">{tab === "invoices" || tab === "owner" ? t("InvoiceDateFrom") : t("From")}</div>
              <DayPicker style={{ width: 150 }} value={f.from} max={f.to} onChange={(v) => setF((x) => ({ ...x, from: v }))} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">{t("To")}</div>
              <DayPicker style={{ width: 150 }} value={f.to} min={f.from} onChange={(v) => setF((x) => ({ ...x, to: v }))} />
            </div>
            <Space wrap>
              {quick.map((p) => (
                <Button
                  key={p.key}
                  size="small"
                  type={f.from === p.from && f.to === p.to ? "primary" : "default"}
                  onClick={() => {
                    const next = { ...f, from: p.from, to: p.to };
                    setF(next);
                    go(next);
                  }}
                >
                  {t(`q_${p.key}`)}
                </Button>
              ))}
            </Space>
          </>
        )}
        {tab === "tenant" && (
          <Select
            style={{ width: 360, maxWidth: "100%" }}
            placeholder={t("ChooseTenant")}
            value={f.customerId ?? undefined}
            onChange={(v) => {
              const next = { ...f, customerId: v ?? null };
              setF(next);
              go(next);
            }}
            showSearch={{ optionFilterProp: "label" }}
            options={(options.tenants ?? []).map((c) => ({ value: c.id, label: tenantLabel(c) }))}
          />
        )}
        {tab !== "tenant" && (
          <Select
            allowClear={tab !== "owner"}
            style={{ width: 200 }}
            placeholder={tab === "owner" ? t("ChooseOwner") : t("AllOwners")}
            value={f.ownerId ?? undefined}
            onChange={(v) => setF((x) => ({ ...x, ownerId: v ?? null, propertyId: null }))}
            showSearch={{ optionFilterProp: "label" }}
            options={options.owners.map((o) => ({ value: o.id, label: o.name }))}
          />
        )}
        {tab !== "owner" && tab !== "tenant" && (
          <Select
            allowClear
            style={{ width: 200 }}
            placeholder={t("AllProperties")}
            value={f.propertyId ?? undefined}
            onChange={(v) => setF((x) => ({ ...x, propertyId: v ?? null }))}
            showSearch={{ optionFilterProp: "label" }}
            options={options.properties
              .filter((p) => !f.ownerId || p.ownerId === f.ownerId)
              .map((p) => ({ value: p.id, label: p.name }))}
          />
        )}
        {STATUS_OPTIONS[tab] && (
          <Segmented
            value={f.status}
            onChange={(v) => {
              const next = { ...f, status: v };
              setF(next);
              go(next);
            }}
            options={STATUS_OPTIONS[tab].map((s) => ({ value: s, label: t(`rs_${s}`) }))}
          />
        )}
        <Button type="primary" icon={<SearchOutlined />} onClick={() => go(f)}>
          {t("Show")}
        </Button>
      </Space>
    </Card>
  );

  const period = showPeriod ? [[t("Period"), `${formatDay(f.from)} - ${formatDay(f.to)}`]] : [];
  const ownerName = options.owners.find((o) => o.id === f.ownerId)?.name;
  const info = [
    ...period,
    ...(ownerName ? [[t("Owner"), ownerName]] : []),
    ...(f.propertyId ? [[t("Property"), options.properties.find((p) => p.id === f.propertyId)?.name ?? ""]] : []),
  ];

  // ---------------- الجداول ----------------
  const contractCell = (r) => (
    <Link href={`/real-estate/contracts/${r.contract.id}`}>
      <bdi className="font-bold">{r.contract.docNo}</bdi>
    </Link>
  );
  const saleCell = (r) =>
    r.sale ? (
      <Link href={`/invoices/sales/${r.sale.id}`}>
        <bdi className="font-bold">{r.sale.docNo}</bdi>
      </Link>
    ) : (
      "—"
    );
  const instStatus = (r) =>
    r.status === "invoiced" ? (
      <Tag color="green">{t("inst_invoiced")}</Tag>
    ) : r.dueDate < now ? (
      <Tag color="red">{t("inst_overdue")}</Tag>
    ) : (
      <Tag color="orange">{t("inst_due")}</Tag>
    );

  let body = null;
  let build = null;
  let empty = !data.rows?.length;

  if (tab === "units") {
    body = (
      <>
        <Row gutter={[12, 12]} className="mb-3">
          <Col xs={8}><Card size="small"><Statistic title={t("UnitsCount")} value={data.totals.units} /></Card></Col>
          <Col xs={8}><Card size="small"><Statistic title={t("status_rented")} value={data.totals.rented} styles={{ content: { color: C.primary } }} /></Card></Col>
          <Col xs={8}><Card size="small"><Statistic title={t("status_available")} value={data.totals.available} styles={{ content: { color: C.successText } }} /></Card></Col>
        </Row>
        <Table
          bordered size="small" rowKey="id" dataSource={data.rows} scroll={{ x: 1000 }}
          pagination={{ pageSize: 100, showSizeChanger: false }}
          columns={[
            { title: "#", key: "no", width: 50, align: "center", render: (_, __, i) => i + 1 },
            { title: t("Property"), dataIndex: "property", width: 160 },
            { title: t("Unit"), key: "u", width: 130, render: (_, r) => `${t(`kind_${r.kind}`)} ${r.unitNo}` },
            { title: t("UseType"), key: "ut", width: 90, align: "center", render: (_, r) => t(`use_${r.useType}`) },
            { title: t("Owner"), dataIndex: "owner", width: 140, render: (v) => v || "—" },
            { title: t("AnnualRent"), dataIndex: "annualRent", width: 120, align: "end", render: (v) => money(v) },
            {
              title: t("Status"), key: "s", width: 100, align: "center",
              render: (_, r) => <Tag color={r.status === "rented" ? "blue" : "green"}>{t(`status_${r.status}`)}</Tag>,
            },
            { title: t("Tenant"), key: "t", width: 170, render: (_, r) => (r.contract ? nameOf(r.contract.tenant) : "—") },
            {
              title: t("Contract"), key: "c", width: 120,
              render: (_, r) => r.contract ? (
                <Link href={`/real-estate/contracts/${r.contract.id}`}>
                  <bdi>{r.contract.docNo}</bdi>
                </Link>
              ) : "—",
            },
            {
              title: t("RentedUntil"), key: "until", width: 120, align: "center",
              render: (_, r) => (r.contract ? <bdi className="font-bold">{formatDay(r.contract.endDate)}</bdi> : "—"),
            },
          ]}
        />
      </>
    );
    build = () => ({
      title: `${t("ReportsTitle")} - ${t("rt_units")}`,
      info,
      summary: [[t("UnitsCount"), String(data.totals.units)], [t("status_rented"), String(data.totals.rented)], [t("status_available"), String(data.totals.available)]],
      columns: [
        { title: t("Property"), key: "property", type: "text", width: 22 },
        { title: t("Unit"), key: "unit", type: "text", width: 16 },
        { title: t("UseType"), key: "use", type: "text", width: 10 },
        { title: t("Owner"), key: "owner", type: "text", width: 18 },
        { title: t("AnnualRent"), key: "rent", type: "money" },
        { title: t("Status"), key: "status", type: "text", width: 10 },
        { title: t("Tenant"), key: "tenant", type: "text", width: 22 },
        { title: t("Contract"), key: "contract", type: "text", width: 14 },
        { title: t("RentedUntil"), key: "end", type: "text", width: 12 },
      ],
      rows: data.rows.map((r) => ({
        key: r.id, property: r.property, unit: `${t(`kind_${r.kind}`)} ${r.unitNo}`, use: t(`use_${r.useType}`),
        owner: r.owner ?? "", rent: r.annualRent, status: t(`status_${r.status}`),
        tenant: r.contract ? nameOf(r.contract.tenant) : "", contract: r.contract?.docNo ?? "",
        end: r.contract ? formatDay(r.contract.endDate) : "",
      })),
    });
  }

  if (tab === "dues") {
    body = (
      <>
        <Row gutter={[12, 12]} className="mb-3">
          <Col xs={8}><Card size="small"><Statistic title={t("InstallmentsCount")} value={data.totals.count} /></Card></Col>
          <Col xs={8}><Card size="small"><Statistic title={t("AmountBeforeTax")} value={money(data.totals.amount)} /></Card></Col>
          <Col xs={8}><Card size="small"><Statistic title={t("inst_overdue")} value={data.totals.overdue} styles={{ content: { color: C.dangerText } }} /></Card></Col>
        </Row>
        <Table
          bordered size="small" rowKey="id" dataSource={data.rows} scroll={{ x: 1150 }}
          pagination={{ pageSize: 100, showSizeChanger: false }}
          columns={[
            { title: t("DueDate"), dataIndex: "dueDate", width: 105, render: (v) => <bdi style={v < now ? { color: C.dangerText } : undefined}>{formatDay(v)}</bdi> },
            { title: t("Contract"), key: "c", width: 115, render: (_, r) => contractCell(r) },
            { title: t("Tenant"), key: "t", width: 170, render: (_, r) => <span>{nameOf(r.tenant)}{r.tenant.phone && <div className="text-xs text-slate-500"><bdi>{r.tenant.phone}</bdi></div>}</span> },
            { title: t("Units"), key: "u", width: 220, render: (_, r) => unitsText(r.units) },
            { title: t("Period"), key: "p", width: 190, render: (_, r) => <bdi>{formatDay(r.periodFrom)} - {formatDay(r.periodTo)}</bdi> },
            { title: t("AmountBeforeTax"), dataIndex: "amount", width: 120, align: "end", render: (v) => money(v) },
            { title: t("Status"), key: "s", width: 100, align: "center", render: (_, r) => instStatus(r) },
            {
              title: t("Invoice"), key: "inv", width: 170,
              render: (_, r) =>
                r.sale ? (
                  <Space size={6}>
                    {saleCell(r)}
                    <Button size="small" icon={<PrinterOutlined />} title={t("PrintInvoice")} onClick={() => printInvoice(r.sale.id, true)} />
                  </Space>
                ) : r.status === "due" && canInvoice ? (
                  <Button size="small" type="primary" icon={<FileDoneOutlined />} onClick={() => setInvFor(r)}>
                    {t("IssueInvoice")}
                  </Button>
                ) : (
                  "—"
                ),
            },
          ]}
        />
        <IssueInvoiceModal
          inst={invFor}
          paymentMethods={paymentMethods}
          onClose={() => setInvFor(null)}
          onDone={(saleId) => printInvoice(saleId, true)}
        />
      </>
    );
    build = () => ({
      title: `${t("ReportsTitle")} - ${t("rt_dues")}`,
      info: [...info, [t("Status"), t(`rs_${f.status}`)]],
      columns: [
        { title: t("DueDate"), key: "due", type: "text", width: 12 },
        { title: t("Contract"), key: "contract", type: "text", width: 14 },
        { title: t("EjarNo"), key: "ejar", type: "text", width: 14 },
        { title: t("Tenant"), key: "tenant", type: "text", width: 22 },
        { title: t("Phone"), key: "phone", type: "text", width: 13 },
        { title: t("Units"), key: "units", type: "text", width: 30 },
        { title: t("Period"), key: "period", type: "text", width: 22 },
        { title: t("AmountBeforeTax"), key: "amount", type: "money" },
        { title: t("Status"), key: "status", type: "text", width: 10 },
        { title: t("Invoice"), key: "invoice", type: "text", width: 14 },
      ],
      rows: data.rows.map((r) => ({
        key: r.id, due: formatDay(r.dueDate), contract: r.contract.docNo, ejar: r.contract.ejarNo ?? "",
        tenant: nameOf(r.tenant), phone: r.tenant.phone ?? "", units: unitsText(r.units),
        period: `${formatDay(r.periodFrom)} - ${formatDay(r.periodTo)}`, amount: r.amount,
        status: r.status === "invoiced" ? t("inst_invoiced") : r.dueDate < now ? t("inst_overdue") : t("inst_due"),
        invoice: r.sale?.docNo ?? "",
      })),
      totals: { amount: data.totals.amount },
    });
  }

  if (tab === "invoices" || tab === "owner") {
    const isOwner = tab === "owner";
    const T = data.totals;
    const val = (r, k) => (isOwner ? r.share[k] : r.sale[k]);
    if (isOwner && !data.owner) {
      body = <Alert type="info" showIcon title={t("ChooseOwnerHint")} />;
      empty = true;
    } else {
      body = (
        <>
          {isOwner && (
            <Card size="small" className="mb-3">
              <Space wrap size={24}>
                <span><b>{t("Owner")}:</b> {data.owner.name}</span>
                {data.owner.phone && <span><b>{t("Phone")}:</b> <bdi>{data.owner.phone}</bdi></span>}
                {data.owner.idNumber && <span><b>{t("IdNumber")}:</b> <bdi>{data.owner.idNumber}</bdi></span>}
              </Space>
            </Card>
          )}
          <Row gutter={[12, 12]} className="mb-3">
            <Col xs={12} md={4}><Card size="small"><Statistic title={t("NetBeforeTax")} value={money(T.net)} /></Card></Col>
            <Col xs={12} md={4}><Card size="small"><Statistic title={t("Vat")} value={money(T.tax)} /></Card></Col>
            <Col xs={12} md={4}><Card size="small"><Statistic title={t("TotalWithTax")} value={money(T.total)} /></Card></Col>
            <Col xs={12} md={4}><Card size="small"><Statistic title={t("Collected")} value={money(T.paid)} styles={{ content: { color: C.successText } }} /></Card></Col>
            <Col xs={12} md={4}><Card size="small"><Statistic title={t("Remaining")} value={money(T.remaining)} styles={{ content: { color: C.dangerText } }} /></Card></Col>
          </Row>
          {!isOwner && (
            <Card size="small" title={t("TaxSummary")} className="mb-3" style={{ maxWidth: 640 }}>
              <Table
                size="small" bordered pagination={false} rowKey="k"
                dataSource={[
                  { k: "c", label: t("TaxableCommercial"), net: T.taxableNet, tax: T.taxAmount },
                  { k: "r", label: t("ExemptResidential"), net: T.exemptNet, tax: 0 },
                ]}
                columns={[
                  { title: t("Type"), dataIndex: "label" },
                  { title: t("NetBeforeTax"), dataIndex: "net", align: "end", render: (v) => money(v) },
                  { title: t("Vat"), dataIndex: "tax", align: "end", render: (v) => money(v) },
                ]}
              />
            </Card>
          )}
          <Table
            bordered size="small" rowKey="id" dataSource={data.rows} scroll={{ x: 1300 }}
            pagination={{ pageSize: 100, showSizeChanger: false }}
            columns={[
              { title: t("Invoice"), key: "inv", width: 120, render: (_, r) => saleCell(r) },
              { title: t("InvoiceDate"), key: "d", width: 105, render: (_, r) => formatDate(r.sale.date) },
              { title: t("Contract"), key: "c", width: 115, render: (_, r) => contractCell(r) },
              { title: t("Tenant"), key: "t", width: 160, render: (_, r) => nameOf(r.tenant) },
              { title: t("Units"), key: "u", width: 200, render: (_, r) => unitsText(r.units) },
              { title: t("Period"), key: "p", width: 185, render: (_, r) => <bdi>{formatDay(r.periodFrom)} - {formatDay(r.periodTo)}</bdi> },
              { title: t("NetBeforeTax"), key: "net", width: 110, align: "end", render: (_, r) => money(val(r, "net")) },
              { title: t("Vat"), key: "tax", width: 95, align: "end", render: (_, r) => money(val(r, "tax")) },
              { title: t("TotalWithTax"), key: "tot", width: 110, align: "end", render: (_, r) => money(val(r, "total")) },
              { title: t("Remaining"), key: "rem", width: 105, align: "end", render: (_, r) => <span style={val(r, "remaining") > 0 ? { color: C.dangerText } : undefined}>{money(val(r, "remaining"))}</span> },
            ]}
          />
        </>
      );
      build = () => ({
        title: `${t("ReportsTitle")} - ${t(isOwner ? "rt_owner" : "rt_invoices")}`,
        info,
        summary: isOwner
          ? []
          : [[t("TaxableCommercial"), `${money(T.taxableNet)} / ${t("Vat")} ${money(T.taxAmount)}`], [t("ExemptResidential"), money(T.exemptNet)]],
        columns: [
          { title: t("Invoice"), key: "invoice", type: "text", width: 14 },
          { title: t("InvoiceDate"), key: "date", type: "text", width: 12 },
          { title: t("Contract"), key: "contract", type: "text", width: 14 },
          { title: t("Tenant"), key: "tenant", type: "text", width: 22 },
          { title: t("Units"), key: "units", type: "text", width: 28 },
          { title: t("Period"), key: "period", type: "text", width: 22 },
          { title: t("NetBeforeTax"), key: "net", type: "money" },
          { title: t("Vat"), key: "tax", type: "money" },
          { title: t("TotalWithTax"), key: "total", type: "money" },
          { title: t("Collected"), key: "paid", type: "money" },
          { title: t("Remaining"), key: "remaining", type: "money" },
        ],
        rows: data.rows.map((r) => ({
          key: r.id, invoice: r.sale.docNo, date: formatDate(r.sale.date), contract: r.contract.docNo,
          tenant: nameOf(r.tenant), units: unitsText(r.units), period: `${formatDay(r.periodFrom)} - ${formatDay(r.periodTo)}`,
          net: val(r, "net"), tax: val(r, "tax"), total: val(r, "total"), paid: val(r, "paid"), remaining: val(r, "remaining"),
        })),
        totals: { net: T.net, tax: T.tax, total: T.total, paid: T.paid, remaining: T.remaining },
      });
    }
  }

  if (tab === "tenant") {
    const T = data.totals;
    const c = data.tenant;
    if (!c) {
      body = <Alert type="info" showIcon title={t("ChooseTenantHint")} />;
      empty = true;
    } else {
      const cards = [
        { k: "ContractTotal", v: T.total, hint: t("BeforeTax") },
        { k: "Invoiced", v: T.invoiced, hint: t("WithTax") },
        { k: "Collected", v: T.collected, color: C.successText },
        { k: "OutstandingOnInvoices", v: T.unpaid, color: C.dangerText },
        { k: "NotInvoicedYet", v: T.notInvoiced, hint: t("BeforeTax") },
      ];
      body = (
        <>
          <Card size="small" className="mb-3">
            <Space wrap size={24}>
              <span><b>{t("Tenant")}:</b> {nameOf(c)} <bdi className="text-slate-500">({c.code})</bdi></span>
              {c.phone && <span><b>{t("Phone")}:</b> <bdi>{c.phone}</bdi></span>}
              {c.idNumber && <span><b>{t("IdNumber")}:</b> <bdi>{c.idNumber}</bdi></span>}
              {c.taxNo && <span><b>{t("TaxNo")}:</b> <bdi>{c.taxNo}</bdi></span>}
              <span><b>{t("ContractsCount")}:</b> {T.contracts}</span>
              <span><b>{t("UnitsCount")}:</b> {T.units} ({t("ActiveUnitsN", { n: T.activeUnits })})</span>
            </Space>
          </Card>
          <Row gutter={[12, 12]} className="mb-3">
            {cards.map((x) => (
              <Col key={x.k} xs={12} md={8} xl={4} flex="auto">
                <Card size="small">
                  <Statistic
                    title={x.hint ? `${t(x.k)} (${x.hint})` : t(x.k)}
                    value={money(x.v)}
                    styles={x.color ? { content: { color: x.color } } : undefined}
                  />
                </Card>
              </Col>
            ))}
          </Row>
          <Table
            bordered size="small" rowKey="id" dataSource={data.rows} scroll={{ x: 1300 }}
            pagination={{ pageSize: 100, showSizeChanger: false }}
            columns={[
              { title: "#", key: "no", width: 50, align: "center", render: (_, __, i) => i + 1 },
              { title: t("Contract"), key: "c", width: 115, render: (_, r) => <Link href={`/real-estate/contracts/${r.id}`}><bdi className="font-bold">{r.docNo}</bdi></Link> },
              { title: t("EjarNo"), dataIndex: "ejarNo", width: 120, render: (v) => (v ? <bdi>{v}</bdi> : "—") },
              { title: t("Units"), key: "u", width: 220, render: (_, r) => unitsText(r.units) },
              { title: t("Period"), key: "p", width: 190, render: (_, r) => <bdi>{formatDay(r.startDate)} - {formatDay(r.exitDate ?? r.endDate)}</bdi> },
              { title: t("Status"), dataIndex: "status", width: 100, align: "center", render: (v) => <Tag color={CONTRACT_STATUS_COLOR[v]}>{t(`cstatus_${v}`)}</Tag> },
              { title: t("ContractTotal"), dataIndex: "total", width: 115, align: "end", render: (v) => money(v) },
              { title: t("Invoiced"), dataIndex: "invoiced", width: 110, align: "end", render: (v) => money(v) },
              { title: t("Collected"), dataIndex: "collected", width: 110, align: "end", render: (v) => <span style={{ color: C.successText }}>{money(v)}</span> },
              { title: t("OutstandingOnInvoices"), dataIndex: "unpaid", width: 120, align: "end", render: (v) => <span style={v > 0 ? { color: C.dangerText } : undefined}>{money(v)}</span> },
              { title: t("NotInvoicedYet"), dataIndex: "notInvoiced", width: 115, align: "end", render: (v) => money(v) },
            ]}
          />
        </>
      );
      build = () => ({
        title: `${t("ReportsTitle")} - ${t("rt_tenant")}`,
        info: [
          [t("Tenant"), `${nameOf(c)} (${c.code})`],
          ...(c.phone ? [[t("Phone"), c.phone]] : []),
          ...(c.idNumber ? [[t("IdNumber"), c.idNumber]] : []),
          ...(c.taxNo ? [[t("TaxNo"), c.taxNo]] : []),
        ],
        summary: [
          [t("ContractsCount"), String(T.contracts)],
          [t("UnitsCount"), `${T.units} (${t("ActiveUnitsN", { n: T.activeUnits })})`],
        ],
        columns: [
          { title: t("Contract"), key: "contract", type: "text", width: 14 },
          { title: t("EjarNo"), key: "ejar", type: "text", width: 14 },
          { title: t("Units"), key: "units", type: "text", width: 30 },
          { title: t("Period"), key: "period", type: "text", width: 22 },
          { title: t("Status"), key: "status", type: "text", width: 10 },
          { title: t("ContractTotal"), key: "total", type: "money" },
          { title: t("Invoiced"), key: "invoiced", type: "money" },
          { title: t("Collected"), key: "collected", type: "money" },
          { title: t("OutstandingOnInvoices"), key: "unpaid", type: "money" },
          { title: t("NotInvoicedYet"), key: "notInvoiced", type: "money" },
        ],
        rows: data.rows.map((r) => ({
          key: r.id, contract: r.docNo, ejar: r.ejarNo ?? "", units: unitsText(r.units),
          period: `${formatDay(r.startDate)} - ${formatDay(r.exitDate ?? r.endDate)}`, status: t(`cstatus_${r.status}`),
          total: r.total, invoiced: r.invoiced, collected: r.collected, unpaid: r.unpaid, notInvoiced: r.notInvoiced,
        })),
        totals: { total: T.total, invoiced: T.invoiced, collected: T.collected, unpaid: T.unpaid, notInvoiced: T.notInvoiced },
      });
    }
  }

  if (tab === "expiring") {
    body = (
      <Table
        bordered size="small" rowKey="id" dataSource={data.rows} scroll={{ x: 1000 }}
        pagination={{ pageSize: 100, showSizeChanger: false }}
        columns={[
          { title: t("Contract"), key: "c", width: 115, render: (_, r) => <Link href={`/real-estate/contracts/${r.id}`}><bdi className="font-bold">{r.docNo}</bdi></Link> },
          { title: t("Tenant"), key: "t", width: 180, render: (_, r) => <span>{nameOf(r.tenant)}{r.tenant.phone && <div className="text-xs text-slate-500"><bdi>{r.tenant.phone}</bdi></div>}</span> },
          { title: t("Units"), key: "u", width: 240, render: (_, r) => unitsText(r.units) },
          { title: t("EndDate"), dataIndex: "endDate", width: 110, render: (v) => formatDay(v) },
          {
            title: t("DaysLeft"), dataIndex: "daysLeft", width: 110, align: "center",
            render: (v) => <Tag color={v <= 7 ? "red" : "orange"}>{t("DaysLeftN", { n: v })}</Tag>,
          },
          { title: t("ContractTotal"), dataIndex: "totalAmount", width: 120, align: "end", render: (v) => money(v) },
        ]}
      />
    );
    build = () => ({
      title: `${t("ReportsTitle")} - ${t("rt_expiring")}`,
      info,
      columns: [
        { title: t("Contract"), key: "contract", type: "text", width: 14 },
        { title: t("EjarNo"), key: "ejar", type: "text", width: 14 },
        { title: t("Tenant"), key: "tenant", type: "text", width: 22 },
        { title: t("Phone"), key: "phone", type: "text", width: 13 },
        { title: t("Units"), key: "units", type: "text", width: 30 },
        { title: t("EndDate"), key: "end", type: "text", width: 12 },
        { title: t("DaysLeft"), key: "days", type: "number", width: 10 },
      ],
      rows: data.rows.map((r) => ({
        key: r.id, contract: r.docNo, ejar: r.ejarNo ?? "", tenant: nameOf(r.tenant), phone: r.tenant.phone ?? "",
        units: unitsText(r.units), end: formatDay(r.endDate), days: r.daysLeft,
      })),
    });
  }

  return (
    <div>
      <PageHeader
        title={t("ReportsTitle")}
        extra={build ? <ExportButtons build={build} disabled={empty} /> : null}
      />
      <Tabs
        activeKey={tab}
        onChange={(k) => go({ ownerId: f.ownerId, propertyId: f.propertyId, customerId: f.customerId }, k)}
        items={TABS.map((k) => ({ key: k, label: t(`rt_${k}`) }))}
      />
      {filterBar}
      {/* طباعة فاتورة الدفعة A4 (بعد الإصدار من التقرير / زرار الطباعة) */}
      <SavedDocPrint job={printJob} onClose={() => setPrintJob(null)} />
      {body}
    </div>
  );
}
