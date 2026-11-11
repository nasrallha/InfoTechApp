"use client";

import { Alert, Card, Table } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { useCurrency } from "@/components/common/CurrencyProvider";
import ReportFilters from "./ReportFilters";
import { KpiRow, ReportHeader, useFilterInfo } from "./ReportParts";
import { C } from "@/lib/theme";
import { formatDay } from "@/lib/dates";
import "./report.css";

// ============================================================
// تقرير الأرباح (قائمة الدخل المختصرة):
// صافي المبيعات - تكلفة المبيعات = مجمل الربح
// - خصم مسموح به + خصم مكتسب - المصروفات + إيرادات أخرى = صافي الربح
// ربح الأصناف (data.mode = "items"): لما يتحدد صنف / مجموعة / فاتورة
// ============================================================
export default function ProfitReportView({ data, filters, options }) {
  const locale = useLocale();
  const t = useTranslations("Reports");
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const info = useFilterInfo(filters, options);
  if (data.mode === "items")
    return <ItemsProfitView data={data} filters={filters} options={options} info={info} nm={nm} />;
  return <IncomeView data={data} filters={filters} options={options} info={info} nm={nm} t={t} />;
}

// فلاتر تقرير الأرباح: الفرع + المجموعة + الصنف + رقم الفاتورة
const PROFIT_FIELDS = ["branch", "category", "item", "q"];

function IncomeView({ data, filters, options, info, nm, t }) {
  const { amount: money, symbol } = useCurrency();
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
        fields={PROFIT_FIELDS}
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

// ربح الأصناف: المبيعات - المرتجع، والتكلفة وقت البيع ← مجمل الربح لكل صنف
function ItemsProfitView({ data, filters, options, info, nm }) {
  const t = useTranslations("Reports");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const D = data;

  const statement = [
    { key: "sales", label: t("SalesNetOfTax"), value: D.salesNet },
    { key: "returns", label: t("SalesReturns"), value: -D.returnsNet },
    { key: "revenue", label: t("NetRevenue"), value: D.revenue, strong: true },
    { key: "cost", label: t("CostOfSales"), value: -D.cost },
    {
      key: "gross",
      label: t("GrossProfit"),
      value: D.gross,
      strong: true,
      hint: `${D.grossMargin}%`,
    },
  ];

  const build = () => ({
    title: `${t("names.profit")} - ${t("ItemsProfit")}`,
    info: info(),
    summary: [
      [t("NetRevenue"), money(D.revenue)],
      [t("CostOfSales"), money(D.cost)],
      [t("GrossProfit"), `${money(D.gross)} (${D.grossMargin}%)`, true],
    ],
    columns: [
      { title: t("Code"), key: "code", type: "text", width: 14 },
      { title: t("Product"), key: "name", type: "text", width: 32 },
      { title: t("SoldQty"), key: "soldQty", type: "qty" },
      { title: t("ReturnedQty"), key: "returnedQty", type: "qty" },
      { title: t("NetQty"), key: "qty", type: "qty" },
      { title: t("SalesValue"), key: "revenue", type: "money" },
      { title: t("Cost"), key: "cost", type: "money" },
      { title: t("Profit"), key: "gross", type: "money" },
      { title: t("Margin"), key: "margin", type: "text", width: 10 },
    ],
    rows: D.items.map((r) => ({
      key: r.productId,
      code: r.product?.code ?? "",
      name: nm(r.product),
      soldQty: r.soldQty,
      returnedQty: r.returnedQty,
      qty: r.qty,
      revenue: r.revenue,
      cost: r.cost,
      gross: r.gross,
      margin: `${r.margin}%`,
    })),
    totals: { revenue: D.revenue, cost: D.cost, gross: D.gross },
  });

  const red = (v) => (v < 0 ? { color: C.dangerText } : undefined);

  return (
    <div>
      <ReportHeader title={t("names.profit")} build={build} />
      <ReportFilters
        filters={filters}
        options={options}
        fields={PROFIT_FIELDS}
        quarters
      />
      <Alert type="info" showIcon className="mb-3" title={t("ItemsProfitHint")} />
      <KpiRow
        items={[
          { title: t("NetRevenue"), value: money(D.revenue), color: C.infoText },
          { title: t("CostOfSales"), value: money(D.cost), color: C.warningText },
          {
            title: t("GrossProfit"),
            value: money(D.gross),
            hint: `${D.grossMargin}%`,
            color: D.gross >= 0 ? C.successText : C.dangerText,
            strong: true,
          },
        ]}
      />
      {/* البحث برقم فاتورة: بياناتها وربحها */}
      {D.docs?.length > 0 && (
        <Card size="small" title={t("InvoiceProfit")} className="mb-3">
          <Table
            size="small"
            bordered
            rowKey="id"
            pagination={false}
            dataSource={D.docs}
            scroll={{ x: 760 }}
            columns={[
              {
                title: t("DocNo"),
                dataIndex: "docNo",
                width: 130,
                render: (v) => <bdi className="font-bold">{v}</bdi>,
              },
              {
                title: t("Date"),
                dataIndex: "date",
                width: 110,
                render: (v) => formatDay(v),
              },
              {
                title: t("Customer"),
                key: "c",
                width: 180,
                render: (_, d) =>
                  locale === "ar"
                    ? d.customerArName
                    : d.customerEnName || d.customerArName,
              },
              {
                title: t("Branch"),
                key: "b",
                width: 130,
                render: (_, d) => nm(d.branch),
              },
              {
                title: t("SalesValue"),
                dataIndex: "netAmount",
                width: 110,
                align: "end",
                render: (v) => money(v),
              },
              {
                title: t("Cost"),
                dataIndex: "costAmount",
                width: 110,
                align: "end",
                render: (v) => money(v),
              },
              {
                title: t("Profit"),
                key: "p",
                width: 110,
                align: "end",
                render: (_, d) => (
                  <span style={red(d.netAmount - d.costAmount)}>
                    {money(d.netAmount - d.costAmount)}
                  </span>
                ),
              },
            ]}
          />
        </Card>
      )}
      <Card size="small" title={t("ItemsProfit")} className="mb-3">
        <Table
          size="small"
          bordered
          rowKey="productId"
          dataSource={D.items}
          scroll={{ x: 1000 }}
          pagination={{ pageSize: 50, showSizeChanger: false }}
          columns={[
            {
              title: t("Product"),
              key: "p",
              width: 260,
              render: (_, r) => (
                <div>
                  <div className="font-bold">{nm(r.product)}</div>
                  <div className="text-xs text-slate-500">
                    <bdi>{r.product?.code}</bdi>
                  </div>
                </div>
              ),
            },
            {
              title: t("SoldQty"),
              dataIndex: "soldQty",
              width: 90,
              align: "center",
            },
            {
              title: t("ReturnedQty"),
              dataIndex: "returnedQty",
              width: 90,
              align: "center",
              render: (v) => (v ? <span style={{ color: C.dangerText }}>{v}</span> : 0),
            },
            {
              title: t("NetQty"),
              key: "q",
              width: 110,
              align: "center",
              render: (_, r) => (
                <b>
                  {r.qty} {nm(r.product?.baseUnit)}
                </b>
              ),
            },
            {
              title: t("SalesValue"),
              dataIndex: "revenue",
              width: 120,
              align: "end",
              render: (v) => money(v),
            },
            {
              title: t("Cost"),
              dataIndex: "cost",
              width: 120,
              align: "end",
              render: (v) => money(v),
            },
            {
              title: t("Profit"),
              dataIndex: "gross",
              width: 120,
              align: "end",
              render: (v) => <span style={red(v)}>{money(v)}</span>,
            },
            {
              title: t("Margin"),
              dataIndex: "margin",
              width: 90,
              align: "center",
              render: (v) => <span style={red(v)}>{v}%</span>,
            },
          ]}
        />
      </Card>
      <div style={{ maxWidth: 820 }}>
        <Card size="small" title={t("IncomeStatement")}>
          <Table
            size="small"
            bordered
            rowKey="key"
            pagination={false}
            dataSource={statement}
            onRow={(s) => ({
              style: s.strong ? { fontWeight: 800, background: C.bg } : undefined,
            })}
            columns={[
              { title: t("Item"), dataIndex: "label" },
              {
                title: t("Amount"),
                key: "v",
                align: "end",
                render: (_, s) => <span style={red(s.value)}>{money(s.value)}</span>,
              },
              { title: "%", dataIndex: "hint", align: "center", width: 70 },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
