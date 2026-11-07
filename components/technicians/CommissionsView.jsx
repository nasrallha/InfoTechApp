"use client";

import { useStaffT } from "./useStaffT";
import { useCallback, useEffect, useState } from "react";
import { Card, Col, Row, Select, Table, Tag, Tooltip } from "antd";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import "@/components/common/status-colors.css";
import DayPicker from "@/components/common/DayPicker";
import TimeBox from "@/components/common/TimeBox";
import ExportButtons from "@/components/reports/ExportButtons";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { Link } from "@/i18n/routing";
import { formatDate } from "@/lib/dates";
import { useBizToday } from "@/components/common/useBusinessDay";
import { saleDocNo } from "@/lib/doc-number";
import { commissionReportAction } from "@/actions/technician.actions";
import { C } from "@/lib/theme";

// ============================================================
// عمولات الفنيين: صافي الخدمات اللي نفذها كل فني في الفترة
// (البيع ناقص المرتجع) × نسبته = المستحق له
// ============================================================
export default function CommissionsView({ technicians = [] }) {
  const t = useStaffT();
  const tAlerts = useTranslations("Alerts");
  const tR = useTranslations("Reports");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  // النهارده = يوم العمل الحالي (بداية يوم العمل)
  const now = useBizToday();
  const [filters, setFilters] = useState({
    from: `${now.slice(0, 7)}-01`,
    to: now,
    technicianId: undefined,
  });
  const [result, setResult] = useState({ key: null, data: null });
  const key = JSON.stringify(filters);
  const load = useCallback(() => commissionReportAction(filters), [filters]);

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
  const data = result.data ?? { rows: [], totals: {} };

  const build = () => ({
    title: t("CommissionsTitle"),
    fileName: "technician-commissions",
    info: [
      [
        t("Period"),
        `${filters.from ?? ""} ${filters.fromTime ?? ""} — ${filters.to ?? ""} ${filters.toTime ?? ""}`,
      ],
    ],
    columns: [
      { title: t("Technician"), key: "name" },
      { title: t("JobsCount"), key: "jobs", type: "number" },
      { title: t("ServicesNet"), key: "net", type: "money" },
      { title: t("Rate"), key: "rate" },
      { title: t("Commission"), key: "commission", type: "money" },
    ],
    rows: data.rows.map((r) => ({
      key: r.id,
      name: nm(r),
      jobs: r.jobs,
      net: r.net,
      rate: `${r.commissionRate}%${r.productRate > 0 ? ` / ${r.productRate}%` : ""}`,
      commission: r.commission,
    })),
    totals: {
      jobs: data.totals.jobs,
      net: data.totals.net,
      commission: data.totals.commission,
    },
    // التفاصيل: لكل واحد كل السطور اللي نفذها/باعها بعمولة كل سطر
    sections: data.rows.map((r) => ({
      title: nm(r),
      columns: [
        { title: t("Invoice"), key: "inv" },
        { title: t("Date"), key: "date" },
        { title: t("Job"), key: "item" },
        { title: t("Customer"), key: "customer" },
        { title: t("ServicesNet"), key: "net", type: "money" },
        { title: t("LineCommission"), key: "commission", type: "money" },
      ],
      rows: r.lines.map((l) => ({
        key: l.id,
        inv: saleDocNo(l.sale.type, l.sale.number),
        date: formatDate(l.sale.date),
        item: nm(l.name),
        customer:
          nm({
            arName: l.sale.customerArName,
            enName: l.sale.customerEnName,
          }) || "—",
        net: l.net,
        commission: l.commission,
      })),
      totals: { net: r.net, commission: r.commission },
    })),
  });

  return (
    <>
      <PageHeader
        title={t("CommissionsTitle")}
        subtitle={t("CommissionsSubtitle")}
        extra={<ExportButtons disabled={!data.rows.length} build={build} />}
      />
      <Card size="small" className="mb-3">
        <Row gutter={[12, 12]}>
          <Col xs={12} md={5}>
            <DayPicker
              value={filters.from}
              onChange={(v) => set({ from: v })}
            />
          </Col>
          <Col xs={12} md={3}>
            <TimeBox
              style={{ width: "100%" }}
              placeholder={tR("FromTime")}
              value={filters.fromTime}
              onChange={(v) => set({ fromTime: v })}
            />
          </Col>
          <Col xs={12} md={5}>
            <DayPicker value={filters.to} onChange={(v) => set({ to: v })} />
          </Col>
          <Col xs={12} md={3}>
            <TimeBox
              style={{ width: "100%" }}
              placeholder={tR("ToTime")}
              value={filters.toTime}
              onChange={(v) => set({ toTime: v })}
            />
          </Col>
          <Col xs={24} md={6}>
            <Select
              allowClear
              showSearch
              style={{ width: "100%" }}
              placeholder={t("AllTechnicians")}
              optionFilterProp="label"
              value={filters.technicianId}
              onChange={(v) => set({ technicianId: v ?? undefined })}
              options={technicians.map((x) => ({ value: x.id, label: nm(x) }))}
            />
          </Col>
        </Row>
      </Card>

      {/* كروت الإجمالي بألوانها */}
      <div className="sc-stats mb-3">
        {[
          ["JobsCount", data.totals.jobs ?? 0, C.info],
          ["ServicesNet", money(data.totals.net ?? 0), C.accent],
          ["Commission", money(data.totals.commission ?? 0), C.purple],
        ].map(([k, v, c]) => (
          <div key={k} className="sc-stat" style={{ "--c": c }}>
            <div className="sc-stat__label">{t(k)}</div>
            <div className="sc-stat__value">{v}</div>
          </div>
        ))}
      </div>

      <Table
        className="sc-table"
        size="small"
        rowKey="id"
        rowClassName={() => "sc-row"}
        onRow={() => ({ style: { "--c": C.purple } })}
        loading={result.key !== key}
        dataSource={data.rows}
        pagination={false}
        scroll={{ x: 700 }}
        expandable={{
          expandedRowRender: (r) => (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={r.lines}
              columns={[
                {
                  title: t("Invoice"),
                  width: 110,
                  render: (_, l) => (
                    <Link
                      href={`/invoices/${l.sale.type === "return" ? "sales-returns" : "sales"}/${l.sale.id}`}
                    >
                      <bdi>{saleDocNo(l.sale.type, l.sale.number)}</bdi>
                    </Link>
                  ),
                },
                {
                  title: t("Date"),
                  width: 100,
                  render: (_, l) => <bdi>{formatDate(l.sale.date)}</bdi>,
                },
                { title: t("Job"), render: (_, l) => nm(l.name) },
                {
                  title: t("Customer"),
                  render: (_, l) =>
                    nm({
                      arName: l.sale.customerArName,
                      enName: l.sale.customerEnName,
                    }) || "—",
                },
                {
                  title: t("Status"),
                  width: 100,
                  render: (_, l) =>
                    l.status ? <Tag>{t(`JobStatus_${l.status}`)}</Tag> : "—",
                },
                {
                  title: t("ServicesNet"),
                  width: 120,
                  align: "end",
                  render: (_, l) => (
                    <span style={{ color: l.net < 0 ? C.dangerText : undefined }}>
                      {money(l.net)}
                    </span>
                  ),
                },
                {
                  title: t("LineCommission"),
                  width: 150,
                  align: "end",
                  render: (_, l) => (
                    <span>
                      <span className="text-gray-400 me-1">
                        {l.rule?.amount != null
                          ? `${money(l.rule.amount)} ×`
                          : `${l.rule?.rate ?? 0}%`}
                      </span>
                      <b
                        style={{
                          color: l.commission < 0 ? C.dangerText : undefined,
                        }}
                      >
                        {money(l.commission)}
                      </b>
                    </span>
                  ),
                },
              ]}
            />
          ),
        }}
        columns={[
          { title: t("Technician"), render: (_, r) => <b>{nm(r)}</b> },
          { title: t("JobsCount"), width: 110, dataIndex: "jobs" },
          {
            title: t("ServicesNet"),
            width: 140,
            align: "end",
            render: (_, r) => money(r.net),
          },
          {
            title: t("Rate"),
            width: 130,
            render: (_, r) => (
              <>
                <Tag color="purple">{r.commissionRate}%</Tag>
                {r.productRate > 0 && (
                  <Tooltip title={t("ProductRate")}>
                    <Tag color="magenta">{r.productRate}%</Tag>
                  </Tooltip>
                )}
              </>
            ),
          },
          {
            title: t("Commission"),
            width: 140,
            align: "end",
            render: (_, r) => <b>{money(r.commission)}</b>,
          },
        ]}
        summary={() =>
          data.rows.length ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2}>
                <b>{t("Total")}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2}>
                {data.totals.jobs}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="end">
                {money(data.totals.net)}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} />
              <Table.Summary.Cell index={5} align="end">
                <b>{money(data.totals.commission)}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null
        }
      />
    </>
  );
}
