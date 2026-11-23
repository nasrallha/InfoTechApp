"use client";

import { Card, Table, Tag } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { formatDateTime } from "@/lib/dates";
import { saleDocHref } from "@/lib/doc-number";
import { qtyText } from "@/lib/unit-qty";
import ReportFilters from "./ReportFilters";
import { KpiRow, ReportHeader, useFilterInfo } from "./ReportParts";
import { C } from "@/lib/theme";

// ============================================================
// تقرير مبيعات الأصناف
// - كل صنف: المباع والمرتجع والصافي (بالوحدة الأساسية) وقيمة المبيعات من غير الضريبة
// - تفتح الصنف ← حركته: كل فاتورة / مرتجع بتاريخه وكميته زي ما اتباع
// - الفلاتر: الفترة، الفرع، البائع، المجموعة الرئيسية، الصنف (كود / باركود / اسم)
// تصدير Excel / PDF / طباعة من أزرار الرأس
// ============================================================
export default function ItemSalesReportView({ data, filters, options }) {
  const t = useTranslations("Reports");
  const locale = useLocale();
  const { amount: money, symbol } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName || x.enName : x.enName || x.arName) : "");
  const info = useFilterInfo(filters, options);
  const T = data.totals;
  const cust = (m) =>
    (locale === "ar" ? m.customerArName || m.customerEnName : m.customerEnName || m.customerArName) ||
    t("CashCustomer");
  const qtyUnit = (q, unit) => `${qtyText(q)}${unit ? ` ${nm(unit)}` : ""}`;

  const build = () => ({
    title: t("names.items"),
    info: info(),
    summary: [
      [t("items.Items"), String(T.items)],
      [t("items.Sold"), qtyText(T.soldQty)],
      [t("items.Returned"), qtyText(T.returnedQty)],
      [t("items.NetQty"), qtyText(T.qty), true],
      [t("items.NetSales"), money(T.net), true],
    ],
    columns: [
      { title: t("Code"), key: "code", type: "text", width: 14 },
      { title: t("items.Item"), key: "name", type: "text" },
      { title: t("items.Unit"), key: "unit", type: "text", width: 10 },
      { title: t("items.Sold"), key: "sold", type: "qty" },
      { title: t("items.Returned"), key: "returned", type: "qty" },
      { title: t("items.NetQty"), key: "qty", type: "qty" },
      { title: t("items.NetSales"), key: "net", type: "money" },
      { title: t("items.InvoicesCount"), key: "invoices", type: "number" },
    ],
    rows: data.rows.map((r) => ({
      key: r.productId,
      code: r.code,
      name: nm(r),
      unit: nm(r.unit),
      sold: r.soldQty,
      returned: r.returnedQty,
      qty: r.qty,
      net: r.net,
      invoices: r.invoices,
    })),
    totals: { sold: T.soldQty, returned: T.returnedQty, qty: T.qty, net: T.net },
    // الحركة: لكل صنف كل فاتورة / مرتجع
    sections: data.rows.map((r) => ({
      title: `${r.code ? `${r.code} - ` : ""}${nm(r)}`,
      columns: [
        { title: t("Date"), key: "date", type: "text", width: 18 },
        { title: t("InvoiceNo"), key: "docNo", type: "text", width: 14 },
        { title: t("Customer"), key: "customer", type: "text" },
        { title: t("items.Qty"), key: "qty", type: "text" },
        { title: t("items.Price"), key: "price", type: "money" },
        { title: t("items.NetSales"), key: "net", type: "money" },
      ],
      rows: r.moves.map((m) => ({
        key: m.id,
        date: formatDateTime(m.date),
        docNo: m.type === "return" ? `${m.docNo} (${t("Return")})` : m.docNo,
        customer: cust(m),
        qty: qtyUnit(m.qty, m.unit),
        price: m.price,
        net: m.net,
      })),
      totals: { net: r.net },
    })),
  });

  return (
    <div>
      <ReportHeader title={t("names.items")} build={build} truncated={data.truncated} />
      <ReportFilters
        filters={filters}
        options={options}
        fields={["branch", "user", "category", "item"]}
        quarters
      />
      <KpiRow
        items={[
          {
            title: t("items.Items"),
            value: String(T.items),
            hint: `${T.invoices} ${t("Invoices")}`,
            color: C.infoText,
          },
          { title: t("items.Sold"), value: qtyText(T.soldQty), color: C.navy },
          {
            title: t("items.Returned"),
            value: qtyText(T.returnedQty),
            hint: `${T.returns} ${t("Returns")}`,
            color: C.dangerText,
          },
          { title: t("items.NetQty"), value: qtyText(T.qty), color: C.successText, strong: true },
          {
            title: t("items.NetSales"),
            value: `${money(T.net)} ${symbol}`,
            color: C.purple,
            strong: true,
          },
        ]}
      />
      <Card size="small" title={t("items.ByItem")}>
        <Table
          size="small"
          rowKey="productId"
          dataSource={data.rows}
          pagination={{ pageSize: 50, hideOnSinglePage: true, showSizeChanger: false }}
          scroll={{ x: 900 }}
          locale={{ emptyText: t("items.Empty") }}
          expandable={{
            expandedRowRender: (r) => (
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={r.moves}
                scroll={{ x: 720 }}
                columns={[
                  { title: t("Date"), dataIndex: "date", width: 150, render: (v) => <bdi>{formatDateTime(v)}</bdi> },
                  {
                    title: t("InvoiceNo"),
                    width: 160,
                    render: (_, m) => (
                      <span>
                        <Link href={saleDocHref(m.type, m.saleId)}>
                          <bdi>{m.docNo}</bdi>
                        </Link>
                        {m.type === "return" && (
                          <Tag color="red" className="ms-1">
                            {t("Return")}
                          </Tag>
                        )}
                      </span>
                    ),
                  },
                  { title: t("Customer"), ellipsis: true, render: (_, m) => cust(m) },
                  {
                    title: t("items.Qty"),
                    width: 130,
                    render: (_, m) => (
                      <span style={{ color: m.qty < 0 ? C.dangerText : undefined }}>
                        <bdi>{qtyUnit(m.qty, m.unit)}</bdi>
                      </span>
                    ),
                  },
                  { title: t("items.Price"), dataIndex: "price", width: 110, align: "end", render: (v) => money(v) },
                  {
                    title: t("items.NetSales"),
                    dataIndex: "net",
                    width: 130,
                    align: "end",
                    render: (v) => <span style={{ color: v < 0 ? C.dangerText : undefined }}>{money(v)}</span>,
                  },
                ]}
              />
            ),
          }}
          columns={[
            { title: t("Code"), dataIndex: "code", width: 110, render: (v) => <bdi>{v}</bdi> },
            { title: t("items.Item"), render: (_, r) => <b>{nm(r)}</b> },
            { title: t("items.Unit"), width: 90, render: (_, r) => nm(r.unit) },
            { title: t("items.Sold"), dataIndex: "soldQty", width: 100, align: "end", render: (v) => qtyText(v) },
            {
              title: t("items.Returned"),
              dataIndex: "returnedQty",
              width: 100,
              align: "end",
              render: (v) => <span style={{ color: v > 0 ? C.dangerText : undefined }}>{qtyText(v)}</span>,
            },
            { title: t("items.NetQty"), dataIndex: "qty", width: 100, align: "end", render: (v) => <b>{qtyText(v)}</b> },
            { title: t("items.NetSales"), dataIndex: "net", width: 130, align: "end", render: (v) => money(v) },
            { title: t("items.InvoicesCount"), dataIndex: "invoices", width: 90, align: "center" },
          ]}
          summary={() =>
            data.rows.length ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={4}>
                  <b>{t("Total")}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="end">
                  {qtyText(T.soldQty)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="end">
                  {qtyText(T.returnedQty)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="end">
                  <b>{qtyText(T.qty)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="end">
                  <b>{money(T.net)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} />
              </Table.Summary.Row>
            ) : null
          }
        />
      </Card>
    </div>
  );
}
