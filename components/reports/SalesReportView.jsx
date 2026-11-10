"use client";

import { Alert, Card, Table, Tag } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { saleDocHref } from "@/lib/doc-number";
import { formatDateTime } from "@/lib/dates";
import { useCurrency } from "@/components/common/CurrencyProvider";
import ReportFilters from "./ReportFilters";
import { DocsTotal, KpiRow, ReportHeader, useFilterInfo } from "./ReportParts";
import { C } from "@/lib/theme";
import RestaurantFeesSection, { feesSummary } from "./RestaurantFeesSection";

// ============================================================
// تقرير المبيعات: الفواتير والمرتجعات بالفلاتر + الرسم + طرق الدفع
// + الكاشير + أكثر الأصناف مبيعاً (والربح لمن يملك صلاحيته)
// ============================================================
export default function SalesReportView({
  data,
  filters,
  options,
  showProfit,
}) {
  const locale = useLocale();
  const t = useTranslations("Reports");
  const { amount: money, symbol } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const un = (x) => (x ? (locale === "ar" ? x.arFullname : x.enFullname) : "");
  const info = useFilterInfo(filters, options);
  const T = data.totals;

  const customerOf = (r) =>
    (locale === "ar" ? r.customerArName : r.customerEnName) ||
    t("CashCustomer");

  const docColumns = [
    {
      title: t("InvoiceNo"),
      key: "doc",
      width: 100,
      render: (_, r) => (
        <Link
          href={saleDocHref(r.type, r.id)}
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
        ) : r.type === "credit" ? (
          <Tag color="gold">{t("CreditNote")}</Tag>
        ) : r.type === "debit" ? (
          <Tag color="cyan">{t("DebitNote")}</Tag>
        ) : (
          <Tag color={r.source === "pos" ? "geekblue" : "blue"}>
            {r.source === "pos" ? t("SourcePos") : t("SourceInvoice")}
          </Tag>
        ),
    },
    {
      title: t("Customer"),
      key: "customer",
      width: 170,
      ellipsis: true,
      render: (_, r) => customerOf(r),
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
    ...(showProfit
      ? [
          {
            title: t("Profit"),
            key: "profit",
            width: 100,
            align: "end",
            render: (_, r) => (
              <span style={{ color: r.profit < 0 ? C.dangerText : C.successText }}>
                {money(r.profit)}
              </span>
            ),
          },
        ]
      : []),
  ];

  const methodColumns = [
    { title: t("PaymentMethod"), key: "m", render: (_, m) => nm(m) },
    {
      title: t("Received"),
      key: "r",
      align: "end",
      render: (_, m) => money(m.received),
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
  ];

  const build = () => ({
    title: t("names.sales"),
    info: info(),
    summary: [
      [t("SalesCount"), String(T.salesCount)],
      [t("Sales"), money(T.sales)],
      [`${t("Returns")} (${T.returnsCount})`, money(T.returns)],
      // الإشعارات: الدائن بالسالب والمدين بالموجب (جوه الصافي)
      ...(T.creditNotesCount
        ? [[`${t("CreditNotes")} (${T.creditNotesCount})`, money(-T.creditNotes)]]
        : []),
      ...(T.debitNotesCount
        ? [[`${t("DebitNotes")} (${T.debitNotesCount})`, money(T.debitNotes)]]
        : []),
      [t("NetBeforeTax"), money(T.net)],
      [t("Tax"), money(T.tax)],
      [t("NetSales"), money(T.total), true],
      // المغسلة: فواتير الاشتراك (للعلم): جوه المبيعات، وفلوسها دخلت وقت الشحن
      ...(data.subscription
        ? [
            [
              `${t("laundry.SubInvoices")} (${data.subscription.count}) - ${t("laundry.InfoOnly")}`,
              money(data.subscription.amount),
            ],
          ]
        : []),
      // المطعم: الرسوم (جوه المبيعات، للعلم)
      ...feesSummary(data.fees, t, money),
      ...(showProfit
        ? [
            [t("Cost"), money(T.cost)],
            [t("Profit"), money(T.profit), true],
          ]
        : []),
    ],
    columns: [
      { title: t("InvoiceNo"), key: "docNo", type: "text", width: 12 },
      { title: t("Date"), key: "date", type: "text", width: 18 },
      { title: t("Customer"), key: "customer", type: "text" },
      { title: t("User"), key: "user", type: "text", width: 18 },
      { title: t("NetBeforeTax"), key: "net", type: "money" },
      { title: t("Tax"), key: "tax", type: "money" },
      { title: t("Total"), key: "total", type: "money" },
      { title: t("Credit"), key: "credit", type: "money" },
      ...(showProfit
        ? [{ title: t("Profit"), key: "profit", type: "money" }]
        : []),
    ],
    rows: data.rows.map((r) => ({
      key: `${r.type}${r.id}`,
      docNo: r.docNo,
      date: formatDateTime(r.date),
      customer: customerOf(r),
      user: un(r.user),
      net: r.net,
      tax: r.tax,
      total: r.total,
      credit: r.credit || null,
      profit: r.profit,
    })),
    totalLabel: t("InvoicesTotal"),
    totals: {
      net: T.net,
      tax: T.tax,
      total: T.total,
      credit: T.credit,
      profit: T.profit,
    },
  });

  return (
    <div>
      <ReportHeader
        title={t("names.sales")}
        build={build}
        truncated={data.truncated}
      />
      <ReportFilters
        filters={filters}
        options={options}
        fields={["branch", "user", "customer", "method", "category", "source", "q"]}
        quarters
      />
      <KpiRow
        items={[
          {
            title: t("Sales"),
            value: money(T.sales),
            hint: `${T.salesCount} ${t("Invoices")}`,
            color: C.infoText,
          },
          {
            title: t("Returns"),
            value: money(T.returns),
            hint: `${T.returnsCount} ${t("Invoices")}`,
            color: C.dangerText,
          },
          // الإشعارات (لو موجودة في الفترة)
          T.creditNotesCount > 0 && {
            title: t("CreditNotes"),
            value: money(T.creditNotes),
            hint: `${T.creditNotesCount} ${t("Notes")}`,
            color: C.warningText,
          },
          T.debitNotesCount > 0 && {
            title: t("DebitNotes"),
            value: money(T.debitNotes),
            hint: `${T.debitNotesCount} ${t("Notes")}`,
            color: C.infoText,
          },
          {
            title: t("NetSales"),
            value: `${money(T.total)} ${symbol}`,
            color: C.navy,
            strong: true,
          },
          { title: t("Tax"), value: money(T.tax), color: C.purple },
          { title: t("Credit"), value: money(T.credit), color: C.warningText },
          showProfit && {
            title: t("Profit"),
            value: money(T.profit),
            color: C.successText,
          },
        ]}
      />
      {/* المطعم: رسوم التبغ / الخدمة / التوصيل (للعلم) */}
      <RestaurantFeesSection fees={data.fees} />
      {/* المغسلة: فواتير الاشتراك للعلم (برا طرق الدفع؛ فلوسها دخلت وقت الشحن) */}
      {data.subscription && (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title={`${t("laundry.SubInvoices")} (${t("laundry.InfoOnly")}): ${data.subscription.count} — ${money(data.subscription.amount)}`}
          description={t("laundry.SalesSubHint")}
        />
      )}
      <div className="report-grid">
        <Card size="small" title={t("ByPaymentMethod")}>
          <Table
            size="small"
            bordered
            rowKey="id"
            pagination={false}
            dataSource={data.methods}
            columns={methodColumns}
          />
        </Card>
        <Card size="small" title={t("ByUser")}>
          <Table
            size="small"
            bordered
            rowKey="id"
            pagination={false}
            dataSource={data.cashiers}
            columns={[
              { title: t("User"), key: "u", render: (_, c) => un(c) },
              { title: t("SalesCount"), dataIndex: "count", align: "center" },
              {
                title: t("Total"),
                key: "t",
                align: "end",
                render: (_, c) => <b>{money(c.total)}</b>,
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
                profit: showProfit ? money(T.profit) : undefined,
              }}
            />
          )}
        />
      </Card>
    </div>
  );
}
