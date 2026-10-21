"use client";

import { Card, Table, Tag } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { useCurrency } from "@/components/common/CurrencyProvider";
import ReportFilters from "./ReportFilters";
import { DocsTotal, KpiRow, ReportHeader, useFilterInfo } from "./ReportParts";

// ============================================================
// تقرير المشتريات: الفواتير والمرتجعات + طرق الدفع + الموردين
// ============================================================
export default function PurchasesReportView({ data, filters, options }) {
  const locale = useLocale();
  const t = useTranslations("Reports");
  const { amount: money, symbol } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const un = (x) => (x ? (locale === "ar" ? x.arFullname : x.enFullname) : "");
  const info = useFilterInfo(filters, options);
  const T = data.totals;
  const supplierOf = (r) =>
    locale === "ar" ? r.supplierArName : r.supplierEnName;

  const docColumns = [
    {
      title: t("InvoiceNo"),
      key: "doc",
      width: 100,
      render: (_, r) => (
        <Link
          href={`/invoices/${r.type === "return" ? "purchase-returns" : "purchases"}/${r.id}`}
        >
          <bdi>{r.docNo}</bdi>
        </Link>
      ),
    },
    {
      title: t("Date"),
      key: "date",
      width: 140,
      render: (_, r) => <bdi>{formatDateTime(r.date)}</bdi>,
    },
    {
      title: t("Type"),
      key: "type",
      width: 90,
      render: (_, r) =>
        r.type === "return" ? (
          <Tag color="red">{t("Return")}</Tag>
        ) : (
          <Tag color="blue">{t("Invoice")}</Tag>
        ),
    },
    {
      title: t("Supplier"),
      key: "supplier",
      width: 180,
      ellipsis: true,
      render: (_, r) => supplierOf(r),
    },
    {
      title: t("SupplierInvoiceNo"),
      dataIndex: "supplierInvoiceNo",
      width: 110,
    },
    {
      title: t("User"),
      key: "user",
      width: 130,
      ellipsis: true,
      render: (_, r) => un(r.user),
    },
    {
      title: t("NetBeforeTax"),
      key: "net",
      width: 110,
      align: "end",
      render: (_, r) => money(r.net),
    },
    {
      title: t("Tax"),
      key: "tax",
      width: 90,
      align: "end",
      render: (_, r) => money(r.tax),
    },
    {
      title: t("Total"),
      key: "total",
      width: 110,
      align: "end",
      render: (_, r) => <b>{money(r.total)}</b>,
    },
    {
      title: t("Credit"),
      key: "credit",
      width: 100,
      align: "end",
      render: (_, r) => (r.credit ? money(r.credit) : ""),
    },
  ];

  const build = () => ({
    title: t("names.purchases"),
    info: info(),
    summary: [
      [t("PurchasesCount"), String(T.purchasesCount)],
      [t("Purchases"), money(T.purchases)],
      [`${t("Returns")} (${T.returnsCount})`, money(T.returns)],
      [t("NetBeforeTax"), money(T.net)],
      [t("Tax"), money(T.tax)],
      [t("NetPurchases"), money(T.total), true],
    ],
    columns: [
      { title: t("InvoiceNo"), key: "docNo", type: "text", width: 12 },
      { title: t("Date"), key: "date", type: "text", width: 18 },
      { title: t("Supplier"), key: "supplier", type: "text" },
      {
        title: t("SupplierInvoiceNo"),
        key: "supplierInvoiceNo",
        type: "text",
        width: 14,
      },
      { title: t("NetBeforeTax"), key: "net", type: "money" },
      { title: t("Tax"), key: "tax", type: "money" },
      { title: t("Total"), key: "total", type: "money" },
      { title: t("Credit"), key: "credit", type: "money" },
    ],
    rows: data.rows.map((r) => ({
      key: `${r.type}${r.id}`,
      docNo: r.docNo,
      date: formatDateTime(r.date),
      supplier: supplierOf(r),
      supplierInvoiceNo: r.supplierInvoiceNo ?? "",
      net: r.net,
      tax: r.tax,
      total: r.total,
      credit: r.credit || null,
    })),
    totalLabel: t("InvoicesTotal"),
    totals: { net: T.net, tax: T.tax, total: T.total, credit: T.credit },
  });

  return (
    <div>
      <ReportHeader
        title={t("names.purchases")}
        build={build}
        truncated={data.truncated}
      />
      <ReportFilters
        filters={filters}
        options={options}
        fields={["branch", "user", "supplier", "method", "q"]}
        quarters
      />
      <KpiRow
        items={[
          {
            title: t("Purchases"),
            value: money(T.purchases),
            hint: `${T.purchasesCount} ${t("Invoices")}`,
            color: "#2471a3",
          },
          {
            title: t("Returns"),
            value: money(T.returns),
            hint: `${T.returnsCount} ${t("Invoices")}`,
            color: "#c0392b",
          },
          {
            title: t("NetPurchases"),
            value: `${money(T.total)} ${symbol}`,
            color: "#1f4e78",
            strong: true,
          },
          { title: t("Tax"), value: money(T.tax), color: "#7d3c98" },
          { title: t("Credit"), value: money(T.credit), color: "#d35400" },
        ]}
      />
      <div className="report-grid">
        <Card size="small" title={t("ByPaymentMethod")}>
          <Table
            size="small"
            bordered
            rowKey="id"
            pagination={false}
            dataSource={data.methods}
            columns={[
              { title: t("PaymentMethod"), key: "m", render: (_, m) => nm(m) },
              {
                title: t("Paid"),
                key: "p",
                align: "end",
                render: (_, m) => money(m.paid),
              },
              {
                title: t("Refunded"),
                key: "f",
                align: "end",
                render: (_, m) => money(m.refunded),
              },
              {
                title: t("Net"),
                key: "n",
                align: "end",
                render: (_, m) => <b>{money(m.net)}</b>,
              },
            ]}
          />
        </Card>
        <Card size="small" title={t("BySupplier")}>
          <Table
            size="small"
            bordered
            rowKey={(s) => `${s.arName}|${s.enName}`}
            pagination={data.suppliers.length > 10 ? { pageSize: 10 } : false}
            dataSource={data.suppliers}
            columns={[
              { title: t("Supplier"), key: "s", render: (_, s) => nm(s) },
              {
                title: t("PurchasesCount"),
                dataIndex: "count",
                align: "center",
              },
              {
                title: t("Total"),
                key: "t",
                align: "end",
                render: (_, s) => <b>{money(s.total)}</b>,
              },
            ]}
          />
        </Card>
      </div>
      <Card size="small" title={t("Documents")}>
        <Table
          size="small"
          bordered
          rowKey={(r) => `${r.type}${r.id}`}
          columns={docColumns}
          dataSource={data.rows}
          pagination={{ pageSize: 50, showSizeChanger: false }}
          scroll={{ x: docColumns.reduce((s, c) => s + c.width, 0) }}
          summary={() => (
            <DocsTotal
              columns={docColumns}
              label={t("InvoicesTotal")}
              values={{
                net: money(T.net),
                tax: money(T.tax),
                total: money(T.total),
                credit: money(T.credit),
              }}
            />
          )}
        />
      </Card>
    </div>
  );
}
