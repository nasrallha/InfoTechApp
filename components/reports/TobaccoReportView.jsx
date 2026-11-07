"use client";

import { Card, Table, Tag } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { formatDateTime } from "@/lib/dates";
import { qtyText } from "@/lib/unit-qty";
import ReportFilters from "./ReportFilters";
import { KpiRow, ReportHeader, useFilterInfo } from "./ReportParts";
import { C } from "@/lib/theme";

// ============================================================
// تقرير التبغ (وحدة restaurant): أصناف التبغ المباعة ورسوم التبغ
// - ملخص: الكمية، قيمة أصناف التبغ، رسوم التبغ، الإجمالي (كله شامل الضريبة)
// - الأصناف: كل صنف تبغ بكميته وقيمته ورسومه (صافي بعد المرتجع)
// - الفواتير: كل فاتورة فيها تبغ بالكمية والقيمة والرسوم
// تصدير Excel / PDF / طباعة من أزرار الرأس
// ============================================================
export default function TobaccoReportView({ data, filters, options }) {
  const t = useTranslations("Reports");
  const locale = useLocale();
  const { amount: money, symbol } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const info = useFilterInfo(filters, options);
  const T = data.totals;
  const cust = (i) =>
    (locale === "ar" ? i.customerArName || i.customerEnName : i.customerEnName || i.customerArName) ||
    t("tobacco.Cash");

  const build = () => ({
    title: t("names.tobacco"),
    info: info(),
    summary: [
      [t("tobacco.Invoices"), String(T.invoices)],
      [t("tobacco.Qty"), qtyText(T.qty)],
      [t("tobacco.ItemsValue"), money(T.sales)],
      [t("tobacco.Fees"), money(T.fees), true],
      [t("tobacco.Total"), money(T.total), true],
    ],
    columns: [
      { title: t("tobacco.InvoiceNo"), key: "docNo", type: "text", width: 14 },
      { title: t("tobacco.Date"), key: "date", type: "text", width: 18 },
      { title: t("tobacco.Customer"), key: "customer", type: "text" },
      { title: t("tobacco.Qty"), key: "qty", type: "qty" },
      { title: t("tobacco.ItemsValue"), key: "sales", type: "money" },
      { title: t("tobacco.Fees"), key: "fees", type: "money" },
      { title: t("tobacco.Total"), key: "total", type: "money" },
    ],
    rows: data.invoices.map((i) => ({
      key: i.id,
      docNo: i.docNo,
      date: formatDateTime(i.date),
      customer: cust(i),
      qty: i.qty,
      sales: i.sales,
      fees: i.fees,
      total: i.total,
    })),
    totals: { qty: T.qty, sales: T.sales, fees: T.fees, total: T.total },
    sections: [
      {
        title: t("tobacco.ByItem"),
        columns: [
          { title: t("Code"), key: "code", type: "text", width: 14 },
          { title: t("tobacco.Item"), key: "name", type: "text" },
          { title: t("tobacco.Qty"), key: "qty", type: "qty" },
          { title: t("tobacco.ItemsValue"), key: "sales", type: "money" },
          { title: t("tobacco.Fees"), key: "fees", type: "money" },
          { title: t("tobacco.Total"), key: "total", type: "money" },
        ],
        rows: data.products.map((p) => ({
          key: p.productId,
          code: p.code,
          name: nm(p),
          qty: p.qty,
          sales: p.sales,
          fees: p.fees,
          total: p.total,
        })),
      },
    ],
  });

  return (
    <div>
      <ReportHeader title={t("names.tobacco")} build={build} />
      <ReportFilters
        filters={filters}
        options={options}
        fields={["branch", "user"]}
        quarters
      />
      <KpiRow
        items={[
          {
            title: t("tobacco.Qty"),
            value: qtyText(T.qty),
            hint: `${T.invoices} ${t("Invoices")}`,
            color: C.infoText,
          },
          { title: t("tobacco.ItemsValue"), value: money(T.sales), color: C.navy },
          { title: t("tobacco.Fees"), value: money(T.fees), color: C.warningText, strong: true },
          {
            title: t("tobacco.Total"),
            value: `${money(T.total)} ${symbol}`,
            color: C.successText,
            strong: true,
          },
        ]}
      />
      <Card size="small" className="mb-4" title={t("tobacco.ByItem")}>
        <Table
          size="small"
          rowKey="productId"
          pagination={false}
          dataSource={data.products}
          scroll={{ x: 720 }}
          locale={{ emptyText: t("tobacco.Empty") }}
          columns={[
            { title: t("Code"), dataIndex: "code", width: 110, render: (v) => <bdi>{v}</bdi> },
            { title: t("tobacco.Item"), render: (_, p) => <b>{nm(p)}</b> },
            { title: t("tobacco.Qty"), dataIndex: "qty", width: 100, render: (v) => qtyText(v) },
            { title: t("tobacco.ItemsValue"), dataIndex: "sales", width: 140, render: (v) => money(v) },
            { title: t("tobacco.Fees"), dataIndex: "fees", width: 130, render: (v) => <b>{money(v)}</b> },
            { title: t("tobacco.Total"), dataIndex: "total", width: 130, render: (v) => money(v) },
          ]}
        />
      </Card>
      <Card size="small" title={t("tobacco.InvoicesList")}>
        <Table
          size="small"
          rowKey="id"
          dataSource={data.invoices}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          scroll={{ x: 760 }}
          locale={{ emptyText: t("tobacco.Empty") }}
          columns={[
            {
              title: t("tobacco.InvoiceNo"),
              dataIndex: "docNo",
              width: 120,
              render: (v, i) => (
                <span>
                  <bdi>{v}</bdi>
                  {i.type === "return" && (
                    <Tag color="red" className="ms-1">
                      {t("Return")}
                    </Tag>
                  )}
                </span>
              ),
            },
            { title: t("tobacco.Date"), dataIndex: "date", width: 160, render: (v) => formatDateTime(v) },
            { title: t("tobacco.Customer"), render: (_, i) => cust(i) },
            { title: t("tobacco.Qty"), dataIndex: "qty", width: 90, render: (v) => qtyText(v) },
            { title: t("tobacco.ItemsValue"), dataIndex: "sales", width: 120, render: (v) => money(v) },
            { title: t("tobacco.Fees"), dataIndex: "fees", width: 120, render: (v) => <b>{money(v)}</b> },
            { title: t("tobacco.Total"), dataIndex: "total", width: 120, render: (v) => money(v) },
          ]}
        />
      </Card>
    </div>
  );
}
