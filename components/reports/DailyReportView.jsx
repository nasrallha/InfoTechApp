"use client";

import { Card, Table, Tag } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import { useCurrency } from "@/components/common/CurrencyProvider";
import ReportFilters from "./ReportFilters";
import { KpiRow, ReportHeader, useFilterInfo } from "./ReportParts";

const COLS = [
  "sales",
  "salesReturns",
  "receipts",
  "purchases",
  "purchaseReturns",
  "payments",
  "cashIn",
  "cashOut",
];
// علامة كل عمود في الصافي
const SIGN = {
  sales: 1,
  salesReturns: -1,
  receipts: 1,
  purchases: -1,
  purchaseReturns: 1,
  payments: -1,
  cashIn: 1,
  cashOut: -1,
};

// ============================================================
// تقرير اليومية: الكاش والشبكة والتحويل فقط (بدون الآجل)
// لكل طريقة: المبيعات، المرتجع، سندات القبض، المشتريات، مرتجع المشتريات،
// سندات الصرف، الإضافة والسحب من الدرج ← الصافي
// + الورديات المقفولة في الفترة (العجز/الزيادة والمورّد للخزنة)
// ============================================================
export default function DailyReportView({ data, filters, options }) {
  const locale = useLocale();
  const t = useTranslations("Reports");
  const { amount: money, symbol } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const un = (x) => (x ? (locale === "ar" ? x.arFullname : x.enFullname) : "");
  const info = useFilterInfo(filters, options);
  const T = data.totals;
  const visible = COLS.filter(
    (k) => T[k] !== 0 || ["sales", "salesReturns"].includes(k),
  );

  const cell = (v, k) =>
    v ? (
      <span style={{ color: SIGN[k] < 0 ? "#c0392b" : undefined }}>
        {SIGN[k] < 0 ? "-" : ""}
        {money(v)}
      </span>
    ) : (
      ""
    );

  const columns = [
    {
      title: t("PaymentMethod"),
      key: "m",
      width: 140,
      fixed: "start",
      render: (_, m) => <b>{nm(m)}</b>,
    },
    ...visible.map((k) => ({
      title: t(`daily.${k}`),
      key: k,
      width: 115,
      align: "end",
      render: (_, m) => cell(m[k], k),
    })),
    {
      title: t("Net"),
      key: "net",
      width: 130,
      align: "end",
      render: (_, m) => <b style={{ fontSize: 15 }}>{money(m.net)}</b>,
    },
  ];

  const shiftColumns = [
    {
      title: t("Shift"),
      key: "n",
      render: (_, s) => (
        <Link href={`/sales/shifts/${s.id}`}>
          {formatDocNo("shift", s.number)}
        </Link>
      ),
    },
    { title: t("User"), key: "u", render: (_, s) => un(s.user) },
    {
      title: t("ExpectedCash"),
      key: "e",
      align: "end",
      render: (_, s) => money(s.expectedCash),
    },
    {
      title: t("CountedCash"),
      key: "c",
      align: "end",
      render: (_, s) => money(s.countedCash),
    },
    {
      title: t("Difference"),
      key: "d",
      align: "center",
      render: (_, s) => {
        const d = Number(s.difference);
        return (
          <Tag color={d === 0 ? "green" : d > 0 ? "blue" : "red"}>
            {d > 0 ? "+" : ""}
            {money(d)}
          </Tag>
        );
      },
    },
    {
      title: t("CardDifference"),
      key: "cd",
      align: "center",
      render: (_, s) =>
        s.cardDifference == null ? "—" : money(s.cardDifference),
    },
    {
      title: t("Deposited"),
      key: "dep",
      align: "end",
      render: (_, s) => money(s.depositedCash),
    },
    {
      title: t("LeftInDrawer"),
      key: "left",
      align: "end",
      render: (_, s) => money(s.leftCash),
    },
  ];

  const build = () => ({
    title: t("names.daily"),
    info: info(),
    summary: [
      [t("daily.sales"), money(T.sales)],
      [t("daily.salesReturns"), money(T.salesReturns)],
      [t("daily.receipts"), money(T.receipts)],
      [t("daily.purchases"), money(T.purchases)],
      [t("daily.payments"), money(T.payments)],
      [t("NetMovement"), money(T.net), true],
    ],
    columns: [
      { title: t("PaymentMethod"), key: "name", type: "text", width: 18 },
      ...visible.map((k) => ({
        title: t(`daily.${k}`),
        key: k,
        type: "money",
      })),
      { title: t("Net"), key: "net", type: "money" },
    ],
    rows: data.methods.map((m) => ({ ...m, key: m.id, name: nm(m) })),
    totals: T,
    sections: [
      data.vouchers.length > 0 && {
        title: t("Vouchers"),
        columns: [
          { title: t("VoucherNo"), key: "docNo", type: "text", width: 12 },
          { title: t("Date"), key: "date", type: "text", width: 18 },
          { title: t("Party"), key: "party", type: "text" },
          { title: t("PaymentMethod"), key: "method", type: "text", width: 16 },
          { title: t("Amount"), key: "amount", type: "money" },
        ],
        rows: data.vouchers.map((v) => ({
          key: v.id,
          docNo: v.docNo,
          date: formatDateTime(v.date),
          party: locale === "ar" ? v.partyArName : v.partyEnName,
          method: nm(v.method),
          amount: v.type === "payment" ? -v.amount : v.amount,
        })),
      },
      data.movements.length > 0 && {
        title: t("DrawerMovements"),
        columns: [
          { title: t("Date"), key: "date", type: "text", width: 18 },
          { title: t("Type"), key: "type", type: "text", width: 12 },
          { title: t("User"), key: "user", type: "text" },
          { title: t("Reason"), key: "reason", type: "text" },
          { title: t("Amount"), key: "amount", type: "money" },
        ],
        rows: data.movements.map((m) => ({
          key: m.id,
          date: formatDateTime(m.createdAt),
          type: t(m.type === "out" ? "daily.cashOut" : "daily.cashIn"),
          user: un(m.createdBy),
          reason: m.reason ?? "",
          amount: m.type === "out" ? -m.amount : m.amount,
        })),
      },
      data.shifts.length > 0 && {
        title: t("ClosedShifts"),
        columns: [
          { title: t("Shift"), key: "no", type: "text", width: 10 },
          { title: t("User"), key: "user", type: "text" },
          { title: t("ExpectedCash"), key: "expectedCash", type: "money" },
          { title: t("CountedCash"), key: "countedCash", type: "money" },
          { title: t("Difference"), key: "difference", type: "money" },
          { title: t("Deposited"), key: "depositedCash", type: "money" },
          { title: t("LeftInDrawer"), key: "leftCash", type: "money" },
        ],
        rows: data.shifts.map((s) => ({
          ...s,
          key: s.id,
          no: formatDocNo("shift", s.number),
          user: un(s.user),
        })),
      },
    ].filter(Boolean),
    signatures: [t("Cashier"), t("Accountant"), t("Approved")],
  });

  return (
    <div>
      <ReportHeader title={t("names.daily")} build={build} />
      <ReportFilters
        filters={filters}
        options={options}
        fields={["branch", "user"]}
      />
      <KpiRow
        items={[
          {
            title: t("daily.sales"),
            value: money(T.sales - T.salesReturns),
            color: "#2471a3",
          },
          {
            title: t("daily.receipts"),
            value: money(T.receipts),
            color: "#1e8449",
          },
          {
            title: t("daily.purchases"),
            value: money(T.purchases - T.purchaseReturns),
            color: "#d35400",
          },
          {
            title: t("daily.payments"),
            value: money(T.payments),
            color: "#c0392b",
          },
          {
            title: t("NetMovement"),
            value: `${money(T.net)} ${symbol}`,
            color: "#1f4e78",
            strong: true,
          },
        ]}
      />
      <Card size="small" title={t("ByPaymentMethod")} className="mb-4">
        <Table
          size="small"
          bordered
          rowKey="id"
          pagination={false}
          dataSource={data.methods}
          columns={columns}
          scroll={{ x: columns.reduce((s, c) => s + c.width, 0) }}
          summary={() => (
            <Table.Summary.Row
              style={{ background: "#f3f6fa", fontWeight: 800 }}
            >
              <Table.Summary.Cell index={0}>{t("Total")}</Table.Summary.Cell>
              {visible.map((k, i) => (
                <Table.Summary.Cell key={k} index={i + 1} align="end">
                  {cell(T[k], k)}
                </Table.Summary.Cell>
              ))}
              <Table.Summary.Cell index={visible.length + 1} align="end">
                {money(T.net)}
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>
      <div className="report-grid">
        <Card size="small" title={t("ClosedShifts")}>
          <Table
            size="small"
            bordered
            rowKey="id"
            pagination={false}
            dataSource={data.shifts}
            columns={shiftColumns}
            scroll={{ x: 800 }}
            locale={{ emptyText: t("NoClosedShifts") }}
          />
        </Card>
      </div>
      {(data.vouchers.length > 0 || data.movements.length > 0) && (
        <div className="report-grid">
          {data.vouchers.length > 0 && (
            <Card size="small" title={t("Vouchers")}>
              <Table
                size="small"
                bordered
                rowKey="id"
                pagination={false}
                dataSource={data.vouchers}
                columns={[
                  {
                    title: t("VoucherNo"),
                    key: "d",
                    render: (_, v) => (
                      <Link href={`/accounts/vouchers/${v.id}`}>{v.docNo}</Link>
                    ),
                  },
                  {
                    title: t("Party"),
                    key: "p",
                    render: (_, v) =>
                      locale === "ar" ? v.partyArName : v.partyEnName,
                  },
                  {
                    title: t("PaymentMethod"),
                    key: "m",
                    render: (_, v) => nm(v.method),
                  },
                  {
                    title: t("Amount"),
                    key: "a",
                    align: "end",
                    render: (_, v) => (
                      <b
                        style={{
                          color: v.type === "payment" ? "#c0392b" : "#1e8449",
                        }}
                      >
                        {v.type === "payment" ? "-" : "+"}
                        {money(v.amount)}
                      </b>
                    ),
                  },
                ]}
              />
            </Card>
          )}
          {data.movements.length > 0 && (
            <Card size="small" title={t("DrawerMovements")}>
              <Table
                size="small"
                bordered
                rowKey="id"
                pagination={false}
                dataSource={data.movements}
                columns={[
                  {
                    title: t("Date"),
                    key: "d",
                    render: (_, m) => <bdi>{formatDateTime(m.createdAt)}</bdi>,
                  },
                  {
                    title: t("User"),
                    key: "u",
                    render: (_, m) => un(m.createdBy),
                  },
                  { title: t("Reason"), dataIndex: "reason" },
                  {
                    title: t("Amount"),
                    key: "a",
                    align: "end",
                    render: (_, m) => (
                      <b
                        style={{
                          color: m.type === "out" ? "#c0392b" : "#1e8449",
                        }}
                      >
                        {m.type === "out" ? "-" : "+"}
                        {money(m.amount)}
                      </b>
                    ),
                  },
                ]}
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
