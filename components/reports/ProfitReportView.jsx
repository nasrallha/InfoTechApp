"use client";

import { Card, Table } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { useCurrency } from "@/components/common/CurrencyProvider";
import ReportFilters from "./ReportFilters";
import { KpiRow, ReportHeader, useFilterInfo } from "./ReportParts";
import { C } from "@/lib/theme";
import "./report.css";

// ============================================================
// تقرير الأرباح (قائمة الدخل المختصرة):
// صافي المبيعات - تكلفة المبيعات = مجمل الربح
// - خصم مسموح به + خصم مكتسب - المصروفات + إيرادات أخرى = صافي الربح
// ============================================================
export default function ProfitReportView({ data, filters, options }) {
  const locale = useLocale();
  const t = useTranslations("Reports");
  const { amount: money, symbol } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const info = useFilterInfo(filters, options);
  const D = data;

  // سطور قائمة الدخل
  const statement = [
    { key: "sales", label: t("SalesNetOfTax"), value: D.salesNet },
    { key: "returns", label: t("SalesReturns"), value: -D.returnsNet },
    // الإشعارات (بتظهر لو فيه حركة)
    ...(D.creditNotesNet
      ? [
          {
            key: "cn",
            label: t("SalesCreditNotes"),
            value: -D.creditNotesNet,
          },
        ]
      : []),
    ...(D.debitNotesNet
      ? [{ key: "dn", label: t("SalesDebitNotes"), value: D.debitNotesNet }]
      : []),
    { key: "revenue", label: t("NetRevenue"), value: D.revenue, strong: true },
    { key: "cost", label: t("CostOfSales"), value: -D.cost },
    {
      key: "gross",
      label: t("GrossProfit"),
      value: D.gross,
      strong: true,
      hint: `${D.grossMargin}%`,
    },
    { key: "allowed", label: t("DiscountAllowed"), value: -D.discountAllowed },
    {
      key: "received",
      label: t("DiscountReceived"),
      value: D.discountReceived,
    },
    ...(D.supplierCredits
      ? [
          {
            key: "pc",
            label: t("PurchaseCreditNotes"),
            value: D.supplierCredits,
          },
        ]
      : []),
    ...(D.supplierDebits
      ? [
          {
            key: "pd",
            label: t("PurchaseDebitNotes"),
            value: -D.supplierDebits,
          },
        ]
      : []),
    ...D.expenses.map((e) => ({
      key: `e${e.id}`,
      label: `${t("Expense")}: ${nm(e)}`,
      value: -e.amount,
    })),
    { key: "other", label: t("OtherIncome"), value: D.otherIncome },
    {
      key: "net",
      label: t("NetProfit"),
      value: D.net,
      strong: true,
      hint: `${D.netMargin}%`,
    },
  ];

  const build = () => ({
    title: t("names.profit"),
    info: info(),
    summary: [
      [t("NetRevenue"), money(D.revenue)],
      [t("CostOfSales"), money(D.cost)],
      [t("GrossProfit"), `${money(D.gross)} (${D.grossMargin}%)`],
      [t("TotalExpenses"), money(D.totalExpenses)],
      [t("NetProfit"), `${money(D.net)} (${D.netMargin}%)`, true],
    ],
    columns: [
      { title: t("Item"), key: "label", type: "text", width: 40 },
      { title: t("Amount"), key: "value", type: "money" },
      { title: "%", key: "hint", type: "text", width: 10 },
    ],
    rows: statement.map((s) => ({ ...s, hint: s.hint ?? "" })),
    signatures: [t("Accountant"), t("Approved")],
  });

  return (
    <div>
      <ReportHeader title={t("names.profit")} build={build} />
      <ReportFilters
        filters={filters}
        options={options}
        fields={["branch"]}
        quarters
      />
      <KpiRow
        items={[
          { title: t("NetRevenue"), value: money(D.revenue), color: C.infoText },
          { title: t("CostOfSales"), value: money(D.cost), color: C.warningText },
          {
            title: t("GrossProfit"),
            value: money(D.gross),
            hint: `${D.grossMargin}%`,
            color: C.accent,
          },
          {
            title: t("TotalExpenses"),
            value: money(D.totalExpenses + D.discountAllowed),
            color: C.dangerText,
          },
          {
            title: t("NetProfit"),
            value: `${money(D.net)} ${symbol}`,
            hint: `${D.netMargin}%`,
            color: D.net >= 0 ? C.successText : C.dangerText,
            strong: true,
          },
        ]}
      />
      <div style={{ maxWidth: 820 }}>
        <Card size="small" title={t("IncomeStatement")}>
          <Table
            size="small"
            bordered
            rowKey="key"
            pagination={false}
            dataSource={statement}
            onRow={(s) => ({
              style: s.strong
                ? { fontWeight: 800, background: C.bg }
                : undefined,
            })}
            columns={[
              { title: t("Item"), dataIndex: "label" },
              {
                title: t("Amount"),
                key: "v",
                align: "end",
                render: (_, s) => (
                  <span style={{ color: s.value < 0 ? C.dangerText : undefined }}>
                    {money(s.value)}
                  </span>
                ),
              },
              { title: "%", dataIndex: "hint", align: "center", width: 70 },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
