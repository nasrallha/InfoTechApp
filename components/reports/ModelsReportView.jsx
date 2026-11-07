"use client";

import { Card, Table, Tag } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { qtyText } from "@/lib/unit-qty";
import ReportFilters from "./ReportFilters";
import { KpiRow, ReportHeader, useFilterInfo } from "./ReportParts";
import { C } from "@/lib/theme";

// ============================================================
// تقرير الموديلات (وحدة المقاسات والألوان)
// كل موديل: الكمية المباعة وصافي المبيعات (بعد المرتجع) والربح والرصيد الحالي
// وبالضغط على الموديل: نفس الأرقام لكل مقاس (ولون)
// ============================================================
export default function ModelsReportView({
  data,
  filters,
  options,
  showProfit,
}) {
  const locale = useLocale();
  const t = useTranslations("Reports");
  const tV = useTranslations("Variants");
  const { amount: money, symbol } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const info = useFilterInfo(filters, options);
  const T = data.totals;
  const hasColors = data.rows.some((m) => m.sizes.some((s) => s.color));

  const stockTag = (v) => (
    <Tag color={v > 0 ? "green" : v < 0 ? "red" : "default"}>{qtyText(v)}</Tag>
  );
  const numbers = [
    {
      title: t("Qty"),
      dataIndex: "qty",
      align: "center",
      width: 90,
      sorter: (a, b) => a.qty - b.qty,
      render: (v) => qtyText(v),
    },
    {
      title: t("NetBeforeTax"),
      dataIndex: "net",
      align: "end",
      width: 130,
      sorter: (a, b) => a.net - b.net,
      render: (v) => money(v),
    },
    ...(showProfit
      ? [
          {
            title: t("Profit"),
            dataIndex: "profit",
            align: "end",
            width: 120,
            sorter: (a, b) => a.profit - b.profit,
            render: (v) => money(v),
          },
        ]
      : []),
    {
      title: tV("Stock"),
      dataIndex: "stock",
      align: "center",
      width: 100,
      sorter: (a, b) => a.stock - b.stock,
      render: stockTag,
    },
  ];

  const columns = [
    {
      title: t("Code"),
      dataIndex: "code",
      width: 110,
      render: (v) => <bdi>{v}</bdi>,
    },
    {
      title: tV("Model"),
      key: "name",
      render: (_, m) => (
        <span>
          {nm(m)}{" "}
          <span style={{ color: C.subtle, fontSize: 12 }}>
            ({m.sizes.length} {tV("SizesCount")})
          </span>
        </span>
      ),
    },
    ...numbers,
  ];

  const sizeColumns = [
    { title: tV("Size"), dataIndex: "size", width: 80, align: "center" },
    ...(hasColors
      ? [{ title: tV("Color"), dataIndex: "color", width: 100 }]
      : []),
    { title: t("Code"), dataIndex: "code", render: (v) => <bdi>{v}</bdi> },
    ...numbers.map(({ sorter: _s, ...c }) => c),
  ];

  const build = () => ({
    title: t("names.models"),
    info: info(),
    summary: [
      [tV("ModelsCount"), String(T.models)],
      [t("Qty"), qtyText(T.qty)],
      [t("NetBeforeTax"), money(T.net), true],
      ...(showProfit ? [[t("Profit"), money(T.profit), true]] : []),
      [tV("Stock"), qtyText(T.stock)],
    ],
    columns: [
      { title: t("Code"), key: "code", type: "text", width: 14 },
      { title: tV("Model"), key: "name", type: "text" },
      { title: tV("Size"), key: "size", type: "text", width: 10 },
      ...(hasColors
        ? [{ title: tV("Color"), key: "color", type: "text", width: 12 }]
        : []),
      { title: t("Qty"), key: "qty", type: "qty" },
      { title: t("NetBeforeTax"), key: "net", type: "money" },
      ...(showProfit
        ? [{ title: t("Profit"), key: "profit", type: "money" }]
        : []),
      { title: tV("Stock"), key: "stock", type: "qty" },
    ],
    // كل موديل ثم مقاساته تحته
    rows: data.rows.flatMap((m) => [
      {
        key: `m${m.id}`,
        code: m.code,
        name: nm(m),
        size: tV("AllSizes"),
        color: "",
        qty: m.qty,
        net: m.net,
        profit: m.profit,
        stock: m.stock,
      },
      ...m.sizes.map((s) => ({
        key: `p${s.id}`,
        code: s.code,
        name: "",
        size: s.size ?? "",
        color: s.color ?? "",
        qty: s.qty,
        net: s.net,
        profit: s.profit,
        stock: s.stock,
      })),
    ]),
    totalLabel: t("Total"),
    totals: { qty: T.qty, net: T.net, profit: T.profit, stock: T.stock },
  });

  return (
    <div>
      <ReportHeader title={t("names.models")} build={build} />
      <ReportFilters
        filters={filters}
        options={options}
        fields={["branch"]}
        quarters
      />
      <KpiRow
        items={[
          {
            title: tV("ModelsCount"),
            value: String(T.models),
            color: C.text2,
          },
          { title: t("Qty"), value: qtyText(T.qty), color: C.infoText },
          {
            title: t("NetBeforeTax"),
            value: `${money(T.net)} ${symbol}`,
            color: C.navy,
            strong: true,
          },
          showProfit && {
            title: t("Profit"),
            value: money(T.profit),
            color: C.successText,
          },
          { title: tV("Stock"), value: qtyText(T.stock), color: C.warningText },
        ]}
      />
      <Card size="small">
        <Table
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={data.rows}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          scroll={{ x: 760 }}
          expandable={{
            expandRowByClick: true,
            expandedRowRender: (m) => (
              <Table
                size="small"
                rowKey="id"
                columns={sizeColumns}
                dataSource={m.sizes}
                pagination={false}
              />
            ),
          }}
        />
      </Card>
    </div>
  );
}
