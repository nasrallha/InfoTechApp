"use client";

import { Card, Table } from "antd";
import { useTranslations } from "next-intl";
import { useCurrency } from "@/components/common/CurrencyProvider";
import ReportFilters from "./ReportFilters";
import { KpiRow, ReportHeader, useFilterInfo } from "./ReportParts";

// "2026-09" ← "09/2026"
const bucketLabel = (key) => `${key.slice(5, 7)}/${key.slice(0, 4)}`;

// ============================================================
// إقرار ضريبة القيمة المضافة (ربع سنوي):
// ضريبة المخرجات (المبيعات - المرتجعات) - ضريبة المدخلات (المشتريات - المرتجعات)
// ============================================================
export default function VatReportView({ data, filters, options }) {
  const t = useTranslations("Reports");
  const { amount: money, symbol } = useCurrency();
  const info = useFilterInfo(filters, options);
  const O = data.output;
  const I = data.input;

  const lines = [
    {
      key: "s1",
      group: t("OutputVat"),
      label: t("StandardSales"),
      ...O.standard,
    },
    {
      key: "s2",
      group: t("OutputVat"),
      label: t("SimplifiedSales"),
      ...O.simplified,
    },
    {
      key: "s3",
      group: t("OutputVat"),
      label: t("SalesReturns"),
      count: O.returns.count,
      net: -O.returns.net,
      tax: -O.returns.tax,
    },
    {
      key: "s4",
      group: t("OutputVat"),
      label: t("TotalOutput"),
      net: O.netSales,
      tax: O.tax,
      strong: true,
    },
    { key: "p1", group: t("InputVat"), label: t("Purchases"), ...I.purchases },
    {
      key: "p2",
      group: t("InputVat"),
      label: t("PurchaseReturns"),
      count: I.returns.count,
      net: -I.returns.net,
      tax: -I.returns.tax,
    },
    {
      key: "p3",
      group: t("InputVat"),
      label: t("TotalInput"),
      net: I.netPurchases,
      tax: I.tax,
      strong: true,
    },
  ];

  const build = () => ({
    title: t("names.vat"),
    info: info(),
    summary: [
      [t("TotalOutput"), money(O.tax)],
      [t("TotalInput"), money(I.tax)],
      [
        data.payable >= 0 ? t("VatPayable") : t("VatRefundable"),
        money(Math.abs(data.payable)),
        true,
      ],
    ],
    columns: [
      { title: t("Section"), key: "group", type: "text", width: 18 },
      { title: t("Item"), key: "label", type: "text", width: 30 },
      { title: t("Count"), key: "count", type: "number" },
      { title: t("NetBeforeTax"), key: "net", type: "money" },
      { title: t("Tax"), key: "tax", type: "money" },
    ],
    rows: lines.map((l) => ({ ...l, count: l.count ?? null })),
    sections: [
      {
        title: t("ByMonth"),
        columns: [
          { title: t("Month"), key: "month", type: "text", width: 14 },
          { title: t("NetSales"), key: "salesNet", type: "money" },
          { title: t("OutputVat"), key: "outputTax", type: "money" },
          { title: t("NetPurchases"), key: "purchasesNet", type: "money" },
          { title: t("InputVat"), key: "inputTax", type: "money" },
          { title: t("VatPayable"), key: "payable", type: "money" },
        ],
        rows: data.months.map((m) => ({ ...m, month: bucketLabel(m.key) })),
        totals: {
          salesNet: O.netSales,
          outputTax: O.tax,
          purchasesNet: I.netPurchases,
          inputTax: I.tax,
          payable: data.payable,
        },
      },
    ],
    signatures: [t("Accountant"), t("Approved")],
  });

  return (
    <div>
      <ReportHeader title={t("names.vat")} build={build} />
      <ReportFilters
        filters={filters}
        options={options}
        fields={["branch"]}
        quarters
      />
      <KpiRow
        items={[
          { title: t("NetSales"), value: money(O.netSales), color: "#2471a3" },
          { title: t("OutputVat"), value: money(O.tax), color: "#1f77b4" },
          {
            title: t("NetPurchases"),
            value: money(I.netPurchases),
            color: "#d35400",
          },
          { title: t("InputVat"), value: money(I.tax), color: "#e67e22" },
          {
            title: data.payable >= 0 ? t("VatPayable") : t("VatRefundable"),
            value: `${money(Math.abs(data.payable))} ${symbol}`,
            color: "#7d3c98",
            strong: true,
          },
        ]}
      />
      <div className="report-grid">
        <Card size="small" title={t("VatReturn")}>
          <Table
            size="small"
            bordered
            rowKey="key"
            pagination={false}
            dataSource={lines}
            onRow={(l) => ({
              style: l.strong
                ? { fontWeight: 800, background: "#f3f6fa" }
                : undefined,
            })}
            columns={[
              { title: t("Section"), dataIndex: "group", width: 110 },
              { title: t("Item"), dataIndex: "label" },
              {
                title: t("Count"),
                dataIndex: "count",
                align: "center",
                width: 70,
              },
              {
                title: t("NetBeforeTax"),
                key: "net",
                align: "end",
                render: (_, l) => money(l.net),
              },
              {
                title: t("Tax"),
                key: "tax",
                align: "end",
                render: (_, l) => money(l.tax),
              },
            ]}
          />
        </Card>
        <Card size="small" title={t("ByMonth")}>
          <Table
            size="small"
            bordered
            rowKey="key"
            pagination={false}
            dataSource={data.months}
            columns={[
              {
                title: t("Month"),
                key: "m",
                render: (_, m) => <bdi>{bucketLabel(m.key)}</bdi>,
              },
              {
                title: t("OutputVat"),
                key: "o",
                align: "end",
                render: (_, m) => money(m.outputTax),
              },
              {
                title: t("InputVat"),
                key: "i",
                align: "end",
                render: (_, m) => money(m.inputTax),
              },
              {
                title: t("VatPayable"),
                key: "p",
                align: "end",
                render: (_, m) => <b>{money(m.payable)}</b>,
              },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
