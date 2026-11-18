"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Col, InputNumber, Row, Select, Space, Table, Tooltip } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import "@/components/common/status-colors.css";
import DayPicker from "@/components/common/DayPicker";
import FiscalYearPicker from "@/components/common/FiscalYearPicker";
import TimeBox from "@/components/common/TimeBox";
import ExportButtons from "@/components/reports/ExportButtons";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { Link } from "@/i18n/routing";
import { formatDate } from "@/lib/dates";
import { round } from "@/lib/invoice-calc";
import { useBizToday } from "@/components/common/useBusinessDay";
import { saleDocNo } from "@/lib/doc-number";
import {
  salesRepsReportAction,
  setRepRateAction,
} from "@/actions/sales-rep.actions";
import { C } from "@/lib/theme";

// ============================================================
// عمولات المناديب: صافي مبيعات كل مندوب في الفترة (من غير الضريبة)
// ناقص مرتجعاته × نسبته = المستحق له
// - النسبة بتتعدّل هنا للحساب (وبتتحفظ للمندوب بزرار الحفظ)
// - التفاصيل: كل فاتورة / مرتجع بالبائع (اللي عمل المستند)
// ============================================================
export default function SalesRepsReportView({ reps = [], branches = null, canSaveRate = false }) {
  const t = useTranslations("SalesReps");
  const tAlerts = useTranslations("Alerts");
  const tR = useTranslations("Reports");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const now = useBizToday();
  const [filters, setFilters] = useState({
    from: `${now.slice(0, 7)}-01`,
    to: now,
    branchId: undefined,
    salesRepId: undefined,
  });
  const [result, setResult] = useState({ key: null, data: null });
  // النسبة المعدّلة في التقرير لكل مندوب (قبل الحفظ)
  const [rates, setRates] = useState({});
  const [savingId, setSavingId] = useState(null);
  const key = JSON.stringify(filters);
  const load = useCallback(() => salesRepsReportAction(filters), [filters]);

  useEffect(() => {
    let alive = true;
    load().then((res) => {
      if (!alive) return;
      if (!res.success) showActionError(res, tAlerts, locale);
      setResult((prev) => ({ key, data: res.success ? res.data : prev.data }));
    });
    return () => {
      alive = false;
    };
  }, [load, key, tAlerts, locale]);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const raw = result.data ?? { rows: [], totals: {} };

  // العمولة بالنسبة المعدّلة (لو اتعدّلت)
  const rows = raw.rows.map((r) => {
    const rate = rates[r.id] ?? r.commissionRate;
    return { ...r, rate, commission: round((r.net * rate) / 100, 2) };
  });
  const totals = {
    ...raw.totals,
    commission: round(rows.reduce((s, r) => s + r.commission, 0), 2),
  };

  const saveRate = async (r) => {
    setSavingId(r.id);
    const res = await setRepRateAction({ userId: r.id, rate: Number(r.rate) || 0 });
    setSavingId(null);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("RateSaved"));
    // النسبة المحفوظة بقت نسبة المندوب
    setResult((prev) => ({
      ...prev,
      data: prev.data && {
        ...prev.data,
        rows: prev.data.rows.map((x) =>
          x.id === r.id ? { ...x, commissionRate: Number(r.rate) || 0 } : x,
        ),
      },
    }));
    setRates((prev) => {
      const next = { ...prev };
      delete next[r.id];
      return next;
    });
  };

  const docNo = (d) => saleDocNo(d.type, d.number, d.docCode);
  const customerOf = (d) =>
    nm({ arName: d.customerArName, enName: d.customerEnName }) || t("CashCustomer");
  // المرتجع بالسالب
  const signed = (d) => (d.type === "return" ? -d.netAmount : d.netAmount);

  const build = () => ({
    title: t("Title"),
    fileName: "sales-rep-commissions",
    info: [
      [
        t("Period"),
        `${filters.from ?? ""} ${filters.fromTime ?? ""} — ${filters.to ?? ""} ${filters.toTime ?? ""}`,
      ],
      ...(filters.branchId && branches
        ? [[t("Branch"), nm(branches.find((b) => b.id === filters.branchId))]]
        : []),
    ],
    columns: [
      { title: t("Rep"), key: "name" },
      { title: t("Invoices"), key: "invoices", type: "number" },
      { title: t("SalesNet"), key: "salesNet", type: "money" },
      { title: t("ReturnsNet"), key: "returnsNet", type: "money" },
      { title: t("Net"), key: "net", type: "money" },
      { title: t("Rate"), key: "rate" },
      { title: t("Commission"), key: "commission", type: "money" },
    ],
    rows: rows.map((r) => ({
      key: r.id,
      name: nm(r),
      invoices: r.invoices,
      salesNet: r.salesNet,
      returnsNet: r.returnsNet,
      net: r.net,
      rate: `${r.rate}%`,
      commission: r.commission,
    })),
    totals: {
      invoices: totals.invoices,
      salesNet: totals.salesNet,
      returnsNet: totals.returnsNet,
      net: totals.net,
      commission: totals.commission,
    },
    // التفاصيل: مستندات كل مندوب بالبائع
    sections: rows
      .filter((r) => r.docs.length)
      .map((r) => ({
        title: nm(r),
        columns: [
          { title: t("Doc"), key: "doc" },
          { title: t("Date"), key: "date" },
          { title: t("Customer"), key: "customer" },
          { title: t("Seller"), key: "seller" },
          { title: t("Net"), key: "net", type: "money" },
        ],
        rows: r.docs.map((d) => ({
          key: d.id,
          doc: docNo(d),
          date: formatDate(d.date),
          customer: customerOf(d),
          seller: nm(d.seller) || "—",
          net: signed(d),
        })),
        totals: { net: r.net },
      })),
  });

  return (
    <>
      <PageHeader
        title={t("Title")}
        subtitle={t("Subtitle")}
        extra={<ExportButtons disabled={!rows.length} build={build} />}
      />
      <Card size="small" className="mb-3">
        <Row gutter={[12, 12]}>
          <Col xs={12} md={3}>
            <FiscalYearPicker
              label={false}
              style={{ width: "100%" }}
              onPick={(from, to) => set({ from, to })}
            />
          </Col>
          <Col xs={12} md={4}>
            <DayPicker value={filters.from} onChange={(v) => set({ from: v })} />
          </Col>
          <Col xs={12} md={2}>
            <TimeBox
              style={{ width: "100%" }}
              placeholder={tR("FromTime")}
              value={filters.fromTime}
              onChange={(v) => set({ fromTime: v })}
            />
          </Col>
          <Col xs={12} md={4}>
            <DayPicker value={filters.to} onChange={(v) => set({ to: v })} />
          </Col>
          <Col xs={12} md={2}>
            <TimeBox
              style={{ width: "100%" }}
              placeholder={tR("ToTime")}
              value={filters.toTime}
              onChange={(v) => set({ toTime: v })}
            />
          </Col>
          {branches && (
            <Col xs={12} md={4}>
              <Select
                allowClear
                showSearch
                style={{ width: "100%" }}
                placeholder={t("AllBranches")}
                optionFilterProp="label"
                value={filters.branchId}
                onChange={(v) => set({ branchId: v ?? undefined })}
                options={branches.map((b) => ({ value: b.id, label: nm(b) }))}
              />
            </Col>
          )}
          <Col xs={24} md={branches ? 5 : 9}>
            <Select
              allowClear
              showSearch
              style={{ width: "100%" }}
              placeholder={t("AllReps")}
              optionFilterProp="label"
              value={filters.salesRepId}
              onChange={(v) => set({ salesRepId: v ?? undefined })}
              options={reps.map((x) => ({ value: x.id, label: nm(x) }))}
            />
          </Col>
        </Row>
      </Card>

      {/* كروت الإجمالي */}
      <div className="sc-stats mb-3">
        {[
          ["Invoices", totals.invoices ?? 0, C.info],
          ["SalesNet", money(totals.salesNet ?? 0), C.accent],
          ["ReturnsNet", money(totals.returnsNet ?? 0), C.dangerText],
          ["Net", money(totals.net ?? 0), C.successText],
          ["Commission", money(totals.commission ?? 0), C.purple],
        ].map(([k, v, c]) => (
          <div key={k} className="sc-stat" style={{ "--c": c }}>
            <div className="sc-stat__label">{t(k)}</div>
            <div className="sc-stat__value">{v}</div>
          </div>
        ))}
      </div>

      {raw.truncated && <div className="mb-2 text-gray-500">{t("Truncated")}</div>}

      <Table
        className="sc-table"
        size="small"
        rowKey="id"
        rowClassName={() => "sc-row"}
        onRow={() => ({ style: { "--c": C.purple } })}
        loading={result.key !== key}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 900 }}
        expandable={{
          rowExpandable: (r) => r.docs.length > 0,
          expandedRowRender: (r) => (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={r.docs}
              scroll={{ x: 700 }}
              columns={[
                {
                  title: t("Doc"),
                  width: 130,
                  render: (_, d) => (
                    <Link
                      href={`/invoices/${d.type === "return" ? "sales-returns" : "sales"}/${d.id}`}
                    >
                      <bdi>{docNo(d)}</bdi>
                    </Link>
                  ),
                },
                {
                  title: t("Date"),
                  width: 100,
                  render: (_, d) => <bdi>{formatDate(d.date)}</bdi>,
                },
                { title: t("Customer"), render: (_, d) => customerOf(d) },
                // البائع: اللي عمل المستند (ممكن يكون المندوب نفسه أو الكاشير)
                { title: t("Seller"), width: 160, render: (_, d) => nm(d.seller) || "—" },
                {
                  title: t("Net"),
                  width: 130,
                  align: "end",
                  render: (_, d) => (
                    <span style={{ color: d.type === "return" ? C.dangerText : undefined }}>
                      {money(signed(d))}
                    </span>
                  ),
                },
              ]}
            />
          ),
        }}
        columns={[
          { title: t("Rep"), render: (_, r) => <b>{nm(r)}</b> },
          { title: t("Invoices"), width: 100, dataIndex: "invoices" },
          {
            title: t("SalesNet"),
            width: 130,
            align: "end",
            render: (_, r) => money(r.salesNet),
          },
          {
            title: t("ReturnsNet"),
            width: 120,
            align: "end",
            render: (_, r) => (
              <span style={{ color: r.returnsNet ? C.dangerText : undefined }}>
                {money(r.returnsNet)}
              </span>
            ),
          },
          {
            title: t("Net"),
            width: 130,
            align: "end",
            render: (_, r) => money(r.net),
          },
          {
            title: (
              <Tooltip title={t("RateHint")}>
                <span>{t("Rate")} ❔</span>
              </Tooltip>
            ),
            width: 170,
            render: (_, r) => {
              const changed = rates[r.id] != null && rates[r.id] !== r.commissionRate;
              return (
                <Space.Compact>
                  <InputNumber
                    size="small"
                    min={0}
                    max={100}
                    step={0.5}
                    suffix="%"
                    style={{ width: 100 }}
                    value={r.rate}
                    onChange={(v) =>
                      setRates((prev) => ({ ...prev, [r.id]: v == null ? 0 : Number(v) }))
                    }
                  />
                  {canSaveRate && changed && (
                    <Tooltip title={t("SaveRate")}>
                      <Button
                        size="small"
                        type="primary"
                        icon={<SaveOutlined />}
                        loading={savingId === r.id}
                        onClick={() => saveRate(r)}
                      />
                    </Tooltip>
                  )}
                </Space.Compact>
              );
            },
          },
          {
            title: t("Commission"),
            width: 130,
            align: "end",
            render: (_, r) => <b style={{ color: C.purple }}>{money(r.commission)}</b>,
          },
        ]}
        summary={() =>
          rows.length ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2}>
                <b>{t("Total")}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2}>{totals.invoices}</Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="end">
                {money(totals.salesNet)}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="end">
                {money(totals.returnsNet)}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="end">
                {money(totals.net)}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={6} />
              <Table.Summary.Cell index={7} align="end">
                <b>{money(totals.commission)}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null
        }
      />
    </>
  );
}
