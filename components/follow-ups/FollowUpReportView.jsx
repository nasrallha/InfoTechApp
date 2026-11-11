"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Col, Row, Segmented, Select, Table, Tag } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import dayjs from "dayjs";
import PageHeader from "@/components/common/PageHeader";
import DayPicker from "@/components/common/DayPicker";
import ExportButtons from "@/components/reports/ExportButtons";
import { showActionError } from "@/components/common/actionError";
import { Link } from "@/i18n/routing";
import { formatDay, today } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import { followUpReportAction } from "@/actions/follow-up.actions";
import { C } from "@/lib/theme";
import "@/components/common/status-colors.css";

// لون كل حالة في التقرير
const STATE_COLORS = {
  all: C.purple,
  overdue: C.danger,
  pending: C.info,
  done: C.success,
};

// أول وآخر يوم في شهر (YYYY-MM)
const monthRange = (ym) => {
  const d = dayjs(`${ym}-01`);
  return {
    from: d.format("YYYY-MM-DD"),
    to: d.endOf("month").format("YYYY-MM-DD"),
  };
};

// ============================================================
// تقرير المتابعات في فترة: شهر أو من تاريخ لتاريخ
// اللي اتعمل في الفترة + اللي ميعاده في الفترة (متأخر / لسه)
// branches: الفروع (لصاحب صلاحية كل الفروع بس، غيره فاضية)
// ============================================================
export default function FollowUpReportView({ branches = [] }) {
  const t = useTranslations("FollowUps");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const now = today();
  const [mode, setMode] = useState("month");
  const [month, setMonth] = useState(now.slice(0, 7));
  const [range, setRange] = useState(() => monthRange(now.slice(0, 7)));
  const [branchId, setBranchId] = useState(undefined);
  const [months, setMonths] = useState(undefined);
  const [result, setResult] = useState({ key: null, data: null });

  // any = كل المواعيد (من غير فترة)
  const period =
    mode === "month" ? monthRange(month) : mode === "range" ? range : {};
  const filters = { ...period, branchId, months };
  const key = JSON.stringify(filters);
  const load = useCallback(() => followUpReportAction(JSON.parse(key)), [key]);

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

  const data = result.data ?? { rows: [] };

  // نص الحالة لكل صف (متأخر كام يوم / فاضل كام / اتعمل إمتى)
  const stateText = (r) =>
    r.state === "done"
      ? t("Rep_DoneOn", { date: formatDay(r.doneDate) })
      : r.state === "overdue"
        ? t("LateBy", { days: -r.days })
        : r.days === 0
          ? t("Today")
          : t("InDays", { days: r.days });
  const placeOf = (r) => [r.place, r.address].filter(Boolean).join(" - ");
  const phoneOf = (r) => r.phone || r.customer?.phone || "";

  const periodText =
    mode === "month"
      ? dayjs(`${month}-01`).format("MM/YYYY")
      : mode === "range"
        ? `${formatDay(period.from)} — ${formatDay(period.to)}`
        : t("Rep_AnyDate");
  const everyText = (m) => t("Rep_EveryMonths", { n: m });

  const build = () => ({
    title: t("ReportTitle"),
    fileName: `follow-ups-${period.from ?? "all"}-${period.to ?? ""}`,
    landscape: true,
    info: [
      [t("Rep_Period"), periodText],
      ...(months ? [[t("Rep_Interval"), everyText(months)]] : []),
      ...(branchId
        ? [[t("Rep_Branch"), nm(branches.find((b) => b.id === branchId))]]
        : []),
    ],
    columns: [
      { title: "#", key: "n", type: "number" },
      { title: t("Customer"), key: "customer" },
      { title: t("Phone"), key: "phone" },
      { title: t("Device"), key: "device" },
      { title: t("Rep_Interval"), key: "every" },
      { title: t("Place"), key: "place" },
      { title: t("LastDate"), key: "last" },
      { title: t("NextDate"), key: "next" },
      { title: t("Rep_Status"), key: "state" },
      { title: t("Rep_VisitsShort"), key: "visits", type: "number" },
    ],
    rows: data.rows.map((r, i) => ({
      key: r.id,
      n: i + 1,
      customer: nm(r.customer),
      phone: phoneOf(r),
      device: r.deviceName,
      every: everyText(r.months),
      place: placeOf(r),
      last: formatDay(r.lastDate),
      next: formatDay(r.nextDate),
      state: stateText(r),
      visits: r.visits,
    })),
  });

  return (
    <>
      <PageHeader
        title={t("ReportTitle")}
        subtitle={t("ReportSubtitle")}
        extra={
          <>
            <Link href="/follow-ups">
              <Button icon={<ArrowRightOutlined />}>{t("Title")}</Button>
            </Link>
            <ExportButtons disabled={!data.rows.length} build={build} />
          </>
        }
      />

      <Card size="small" className="mb-3">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={6}>
            <Segmented
              block
              value={mode}
              onChange={setMode}
              options={[
                { value: "month", label: t("Rep_Month") },
                { value: "range", label: t("Rep_Range") },
                { value: "any", label: t("Rep_AnyDate") },
              ]}
            />
          </Col>
          {mode === "any" ? null : mode === "month" ? (
            <Col xs={24} md={6}>
              <Select
                style={{ width: "100%" }}
                value={month}
                onChange={setMonth}
                options={monthOptions(now)}
              />
            </Col>
          ) : (
            <>
              <Col xs={12} md={5}>
                <DayPicker
                  value={range.from}
                  onChange={(v) => v && setRange((p) => ({ ...p, from: v }))}
                />
              </Col>
              <Col xs={12} md={5}>
                <DayPicker
                  value={range.to}
                  onChange={(v) => v && setRange((p) => ({ ...p, to: v }))}
                />
              </Col>
            </>
          )}
          {/* المتابعة كل كام شهر */}
          <Col xs={24} md={5}>
            <Select
              allowClear
              style={{ width: "100%" }}
              placeholder={t("Rep_AllIntervals")}
              value={months}
              onChange={(v) => setMonths(v ?? undefined)}
              options={[1, 2, 3, 4, 6, 9, 12, 18, 24].map((m) => ({
                value: m,
                label: everyText(m),
              }))}
            />
          </Col>
          {branches.length > 1 && (
            <Col xs={24} md={6}>
              <Select
                allowClear
                style={{ width: "100%" }}
                placeholder={t("Rep_AllBranches")}
                value={branchId}
                onChange={(v) => setBranchId(v ?? undefined)}
                options={branches.map((b) => ({ value: b.id, label: nm(b) }))}
              />
            </Col>
          )}
        </Row>
      </Card>

      <Table
        className="sc-table"
        size="small"
        rowKey="id"
        rowClassName={() => "sc-row"}
        onRow={(r) => ({ style: { "--c": STATE_COLORS[r.state] } })}
        loading={result.key !== key}
        dataSource={data.rows}
        pagination={{
          pageSize: 50,
          showSizeChanger: false,
          hideOnSinglePage: true,
        }}
        scroll={{ x: 1000 }}
        columns={[
          {
            title: "#",
            width: 50,
            render: (_, __, i) => i + 1,
          },
          {
            title: t("Customer"),
            render: (_, r) => (
              <>
                <b>{nm(r.customer)}</b>
                {phoneOf(r) && (
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    <bdi>{phoneOf(r)}</bdi>
                  </div>
                )}
              </>
            ),
          },
          {
            title: t("Device"),
            render: (_, r) => (
              <>
                {r.deviceName}
                {placeOf(r) && (
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    {placeOf(r)}
                  </div>
                )}
              </>
            ),
          },
          {
            title: t("Rep_Interval"),
            width: 110,
            render: (_, r) => <Tag>{everyText(r.months)}</Tag>,
          },
          {
            title: t("LastDate"),
            width: 110,
            render: (_, r) => <bdi>{formatDay(r.lastDate)}</bdi>,
          },
          {
            title: t("NextDate"),
            width: 110,
            render: (_, r) => <bdi>{formatDay(r.nextDate)}</bdi>,
          },
          {
            title: t("Rep_Status"),
            width: 170,
            render: (_, r) => (
              <>
                <Tag color={STATE_COLORS[r.state]}>{stateText(r)}</Tag>
                {r.sale && (
                  <Link href={`/invoices/sales/${r.sale.id}`}>
                    <bdi>{saleDocNo("sale", r.sale.number, r.sale.docCode)}</bdi>
                  </Link>
                )}
              </>
            ),
          },
          {
            title: t("Rep_VisitsShort"),
            width: 90,
            align: "center",
            dataIndex: "visits",
          },
          {
            title: "",
            width: 60,
            render: (_, r) => (
              <Link href={`/follow-ups?focus=${r.id}`}>{t("Rep_Open")}</Link>
            ),
          },
        ]}
      />
    </>
  );
}

// آخر 24 شهر + الشهور الـ 3 الجاية (للمواعيد اللي جاية)
function monthOptions(now) {
  const base = dayjs(`${now.slice(0, 7)}-01`);
  const list = [];
  for (let i = 3; i >= -24; i--) {
    const d = base.add(i, "month");
    list.push({ value: d.format("YYYY-MM"), label: d.format("MM/YYYY") });
  }
  return list;
}
