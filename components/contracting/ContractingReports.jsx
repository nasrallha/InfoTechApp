"use client";

import { Button, Input, Progress, Segmented, Select, Space, Table, Tabs, Tag, Tooltip } from "antd";
import { QuestionCircleOutlined, SearchOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import PageHeader from "@/components/common/PageHeader";
import { useCurrency } from "@/components/common/CurrencyProvider";
import ExportButtons from "@/components/reports/ExportButtons";
import { formatDay } from "@/lib/dates";
import { C } from "@/lib/theme";
import { CONTRACT_STATUS_COLOR } from "./ContractsList";

// ============================================================
// تقارير المقاولات (التبويب والفلاتر في الرابط)
// - موقف العقود (مع المالك / مقاولي الباطن): القيمة والمنفّذ والدفعة المقدمة والضمان والمحصّل والمستحق
// - الضمانات المحجوزة: الباقي وموعد الإفراج (المتأخر بالأحمر)
// - ملخص المشاريع: كل مشروع بمكانه وقيمته وضريبته ونسبه والمنفّذ ونسبة الإنجاز وعدد المستخلصات
//   والمحصّل والمستحق (فلتر السنة والبحث والحالة) + عدد المشاريع والإجماليات
// + تصدير Excel / PDF / طباعة لكل تبويب
// ============================================================
const TABS = ["summary", "position", "retentions"];

export default function ContractingReports({ data, filters }) {
  const t = useTranslations("Contracting");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { amount: money } = useCurrency();
  const [search, setSearch] = useState(filters.q ?? "");
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName || x.arName) : "—");

  const go = (patch) => {
    const f = { ...filters, ...patch };
    const q = new URLSearchParams();
    if (f.tab !== "summary") q.set("tab", f.tab);
    if (f.kind !== "owner") q.set("kind", f.kind);
    if (f.status !== "active") q.set("status", f.status);
    if (f.tab === "summary" && f.year) q.set("year", String(f.year));
    if (f.tab === "summary" && f.q) q.set("q", f.q);
    router.push(`${pathname}${q.toString() ? `?${q}` : ""}`);
  };

  const docCol = {
    title: t("ContractNo"),
    dataIndex: "docNo",
    width: 115,
    render: (v, r) => (
      <Link href={`/contracting/${r.id}`}>
        <b>
          <bdi>{v}</bdi>
        </b>
      </Link>
    ),
  };
  const projectCol = { title: t("Project"), dataIndex: "projectName", width: 200 };
  const partyCol = {
    title: t("Party"),
    key: "party",
    width: 170,
    render: (_, r) => (
      <span>
        {nameOf(r.party)}
        <div className="text-xs text-slate-500">{t(`kind_${r.kind}`)}</div>
      </span>
    ),
  };
  const m = (key, title, width = 120, color) => ({
    title,
    dataIndex: key,
    width,
    align: "end",
    money: true,
    render: (v) => <span style={color && v ? { color: color(v) } : undefined}>{money(v)}</span>,
  });
  const pctCol = (key, title, width = 85) => ({ title, dataIndex: key, width, align: "center", render: (v) => `${v}%` });
  const progressCol = {
    title: (
      <span>
        {t("Progress")}
        <Tooltip title={t("ProgressHint")}>
          <QuestionCircleOutlined className="ms-1" />
        </Tooltip>
      </span>
    ),
    exportTitle: t("Progress"),
    dataIndex: "progress",
    width: 120,
    render: (v) => <Progress size="small" percent={v} strokeColor={C.success} />,
  };
  const statusCol = {
    title: t("Status"),
    dataIndex: "status",
    width: 95,
    align: "center",
    render: (v) => <Tag color={CONTRACT_STATUS_COLOR[v]}>{t(`status_${v}`)}</Tag>,
  };

  const columns =
    filters.tab === "summary"
      ? [
          docCol,
          projectCol,
          { title: t("ProjectLocation"), dataIndex: "projectLocation", width: 150, render: (v) => v || "—" },
          { title: t("Owner"), key: "o", width: 160, render: (_, r) => nameOf(r.party) },
          { title: t("SignDate"), dataIndex: "signDate", width: 100, render: (v) => formatDay(v) },
          { title: t("EndDate"), dataIndex: "endDate", width: 100, render: (v) => (v ? formatDay(v) : "—") },
          m("totalAmount", t("ContractValue"), 125),
          m("totalWithTax", t("TotalWithTax"), 125),
          pctCol("advancePct", t("AdvancePct")),
          pctCol("recoveryPct", t("RecoveryPct")),
          pctCol("retentionPct", t("RetentionPct")),
          { title: t("CertCount"), dataIndex: "certCount", width: 85, align: "center" },
          m("certified", t("CertifiedWorks"), 125),
          progressCol,
          m("invoiced", t("Invoiced"), 125),
          m("collected", t("Collected"), 125),
          m("retentionLeft", t("RetentionHeld"), 120),
          m("due", t("Due"), 120, (v) => (v > 0 ? C.dangerText : undefined)),
          statusCol,
        ]
      : filters.tab === "retentions"
      ? [
          docCol,
          projectCol,
          partyCol,
          m("retentionLeft", t("RetentionHeld"), 130),
          {
            title: t("RetentionReleaseDate"),
            dataIndex: "retentionReleaseDate",
            width: 130,
            render: (v, r) =>
              v ? (
                <span style={r.overdue ? { color: C.dangerText, fontWeight: 700 } : undefined}>
                  {formatDay(v)} {r.overdue && <Tag color="red">{t("ReleaseDue")}</Tag>}
                </span>
              ) : (
                "—"
              ),
          },
          { title: t("Status"), dataIndex: "status", width: 100, align: "center", render: (v) => <Tag color={CONTRACT_STATUS_COLOR[v]}>{t(`status_${v}`)}</Tag> },
        ]
      : [
            docCol,
            projectCol,
            partyCol,
            m("totalAmount", t("ContractValue")),
            m("certified", t("CertifiedWorks")),
            progressCol,
            m("advanceLeft", t("AdvanceLeft")),
            m("retentionLeft", t("RetentionHeld")),
            m("invoiced", t("Invoiced")),
            m("collected", filters.kind === "sub" ? t("Paid") : t("Collected")),
            m("due", t("Due"), 120, (v) => (v > 0 ? C.dangerText : undefined)),
          ];

  const totals = data.totals;
  const width = columns.reduce((s, c) => s + c.width, 0);

  const table = (
    <Table
      bordered
      size="small"
      rowKey="id"
      columns={columns}
      dataSource={data.rows}
      pagination={false}
      tableLayout="fixed"
      scroll={{ x: width }}
      locale={{ emptyText: t("NoData") }}
      summary={
        totals && filters.tab === "summary"
          ? () => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={6}>
                  <b>
                    {t("Total")} — {t("ProjectsCount")}: {totals.count}
                  </b>
                </Table.Summary.Cell>
                {["totalAmount", "totalWithTax"].map((k, i) => (
                  <Table.Summary.Cell key={k} index={6 + i} align="end">
                    <b>{money(totals[k])}</b>
                  </Table.Summary.Cell>
                ))}
                <Table.Summary.Cell index={8} colSpan={4} />
                <Table.Summary.Cell index={12} align="end">
                  <b>{money(totals.certified)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={13} align="center">
                  <b>{totals.progress}%</b>
                </Table.Summary.Cell>
                {["invoiced", "collected", "retentionLeft", "due"].map((k, i) => (
                  <Table.Summary.Cell key={k} index={14 + i} align="end">
                    <b>{money(totals[k])}</b>
                  </Table.Summary.Cell>
                ))}
                <Table.Summary.Cell index={18} />
              </Table.Summary.Row>
            )
          : totals
          ? () => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <b>{t("Total")}</b>
                </Table.Summary.Cell>
                {["totalAmount", "certified"].map((k, i) => (
                  <Table.Summary.Cell key={k} index={3 + i} align="end">
                    <b>{money(totals[k])}</b>
                  </Table.Summary.Cell>
                ))}
                <Table.Summary.Cell index={5} />
                {["advanceLeft", "retentionLeft", "invoiced", "collected", "due"].map((k, i) => (
                  <Table.Summary.Cell key={k} index={6 + i} align="end">
                    <b>{money(totals[k])}</b>
                  </Table.Summary.Cell>
                ))}
              </Table.Summary.Row>
            )
          : undefined
      }
    />
  );

  // التصدير (Excel / PDF / طباعة): نفس الأعمدة، والمبالغ أرقام
  const cellOf = (c, r) => {
    const v = r[c.dataIndex ?? c.key];
    if (c.key === "party" || c.key === "o") return nameOf(r.party);
    if (c.dataIndex === "progress" || c.dataIndex?.endsWith("Pct")) return `${v ?? 0}%`;
    if (c.dataIndex === "status") return t(`status_${v}`);
    if (["retentionReleaseDate", "signDate", "endDate"].includes(c.dataIndex)) return v ? formatDay(v) : "—";
    if (c.money) return v ?? 0;
    return v ?? "—";
  };
  const buildReport = () => ({
    title: t(`report_${filters.tab}`),
    fileName: t(`report_${filters.tab}`),
    info: [
      ...(filters.tab === "position" ? [[t("CertKind"), t(`kind_${filters.kind}`)]] : []),
      [t("Status"), t(`status_${filters.status}`)],
      ...(filters.tab === "summary" ? [[t("Year"), filters.year ? String(filters.year) : t("AllYears")]] : []),
      ...(filters.tab === "summary" && filters.q ? [[t("Search"), filters.q]] : []),
      ...(filters.tab === "summary" && totals ? [[t("ProjectsCount"), String(totals.count)]] : []),
    ],
    columns: columns.map((c) => ({
      title: c.exportTitle ?? c.title,
      key: c.dataIndex ?? c.key,
      type: c.money ? "money" : "text",
      width: c.money ? 15 : Math.max(10, Math.round(c.width / 8)),
    })),
    rows: data.rows.map((r) => Object.fromEntries([["key", r.id], ...columns.map((c) => [c.dataIndex ?? c.key, cellOf(c, r)])])),
    totals: totals
      ? Object.fromEntries(columns.filter((c) => c.money).map((c) => [c.dataIndex, totals[c.dataIndex] ?? null]))
      : null,
  });

  return (
    <div>
      <PageHeader
        title={t("ReportsTitle")}
        extra={<ExportButtons build={buildReport} disabled={!data.rows.length} />}
      />
      <Tabs
        activeKey={filters.tab}
        onChange={(k) => go({ tab: k })}
        items={TABS.map((k) => ({ key: k, label: t(`report_${k}`) }))}
      />
      <div className="cp-filters mb-3">
        <Space wrap>
          {/* ملخص المشاريع: السنة + البحث (Enter أو الزرار) */}
          {filters.tab === "summary" && (
            <Select
              style={{ width: 140 }}
              value={filters.year ?? 0}
              onChange={(v) => go({ year: v || null })}
              options={[
                { value: 0, label: t("AllYears") },
                ...(data.years ?? []).map((y) => ({ value: y, label: String(y) })),
              ]}
            />
          )}
          {filters.tab === "summary" && (
            <Space.Compact style={{ width: 320 }}>
              <Input
                allowClear
                autoComplete="off"
                value={search}
                placeholder={t("ProjectSearch")}
                onChange={(e) => setSearch(e.target.value)}
                onPressEnter={() => go({ q: search.trim() })}
              />
              <Button type="primary" icon={<SearchOutlined />} onClick={() => go({ q: search.trim() })} aria-label={t("Search")} title={t("Search")} />
            </Space.Compact>
          )}
          {filters.tab === "position" && (
            <Segmented
              value={filters.kind}
              onChange={(v) => go({ kind: v })}
              options={["owner", "sub"].map((k) => ({ value: k, label: t(`kind_${k}`) }))}
            />
          )}
          {(
            <Segmented
              value={filters.status}
              onChange={(v) => go({ status: v })}
              options={["active", "completed", "all"].map((s) => ({ value: s, label: t(`status_${s}`) }))}
            />
          )}
        </Space>
      </div>
      {table}

    </div>
  );
}
