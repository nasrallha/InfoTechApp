"use client";

import { useEffect, useRef, useState } from "react";
import { Table, Tag, Tooltip } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { getStockMovementReportAction } from "@/actions/inventory.actions";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { message } from "@/components/common/feedback";
import ExportButtons from "@/components/reports/ExportButtons";
import { breakdown } from "@/lib/unit-breakdown";
import { formatDay } from "@/lib/dates";
import UnitBreakdown from "./UnitBreakdown";
import { C } from "@/lib/theme";
import "@/components/common/table.css";

const q3 = (v) => Number(Number(v ?? 0).toFixed(3));

// أعمدة الحركة بالترتيب + لون كل عمود (الوارد أخضر، الخارج أحمر)
const MOVES = [
  ["purchase", C.successText],
  ["purchase_return", C.warningText],
  ["sale", C.dangerText],
  ["sale_return", C.successText],
  ["transfer_in", C.accent],
  ["transfer_out", C.warningText],
  ["count", C.purple],
  ["damage", C.dangerText],
  ["surplus", C.successText],
];

// الرصيد بالوحدات كنص: "2 كرتونة و 3 شدة و 20 حبة"
export function unitsText(qty, units, nameOf, joiner) {
  if (!units || units.length < 2) return "";
  const parts = breakdown(qty, units).filter((p) => p.qty !== 0);
  if (!parts.length) return "0";
  return parts.map((p) => `${q3(p.qty)} ${nameOf(p.unit)}`).join(joiner);
}

// ============================================================
// حركة المخزون الشاملة (جوه شاشة أرصدة المخزون)
// لكل صنف: الرصيد الافتتاحي ← المشتريات والمبيعات والمرتجعات والتحويلات
// وفروق الجرد والتالف والزيادة ← الرصيد المتبقي (بالحبة وبالوحدات) والقيمة
// filters: { warehouseId, q, categoryId, from, to, hideIdle }
// ============================================================
export default function StockMovementTable({
  filters,
  warehouseLabel,
  onOpenCard,
}) {
  const t = useTranslations("Inventory");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({
    rows: [],
    total: 0,
    pageSize: 50,
    totals: {},
  });
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const key = JSON.stringify(filters);
  const [lastKey, setLastKey] = useState(key);
  // فلتر جديد ← أول صفحة
  if (key !== lastKey) {
    setLastKey(key);
    setPage(1);
  }

  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await getStockMovementReportAction({ ...filters, page });
      if (id !== requestId.current) return;
      setLoading(false);
      if (!res.success) return message.error(tAlerts(res.error));
      setData(res.data);
    }, 250);
    return () => clearTimeout(timer);
    // filters بيتقارن بالنص (key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page, tAlerts]);

  const num = (v, color) => (
    <span
      style={{
        color: v ? color : C.subtle,
        fontWeight: v ? 600 : 400,
      }}
    >
      {q3(v)}
    </span>
  );

  const columns = [
    {
      title: t("Code"),
      key: "code",
      width: 100,
      fixed: "start",
      render: (_, r) => <bdi>{r.code}</bdi>,
    },
    {
      title: t("Item"),
      key: "item",
      width: 200,
      fixed: "start",
      render: (_, r) => (
        <div style={{ cursor: "pointer" }}>
          <b>{nameOf(r)}</b>
          {!r.isActive && (
            <Tag className="ms-2" color="default">
              {t("Inactive")}
            </Tag>
          )}
          <div style={{ fontSize: 12, color: C.muted }}>{nameOf(r.unit)}</div>
        </div>
      ),
    },
    {
      title: t("OpeningBalance"),
      key: "opening",
      width: 100,
      render: (_, r) => <b>{q3(r.opening)}</b>,
    },
    ...MOVES.map(([k, color]) => ({
      title: t(`Movement.${k}`),
      key: k,
      width: 95,
      render: (_, r) =>
        k === "count" && r.count ? (
          <b style={{ color }}>
            {r.count > 0 ? "+" : ""}
            {q3(r.count)}
          </b>
        ) : (
          num(r[k], color)
        ),
    })),
    {
      title: t("RemainingBalance"),
      key: "balance",
      width: 110,
      render: (_, r) => (
        <Tooltip
          title={
            r.units.length > 1 ? (
              <UnitBreakdown qty={r.balance} units={r.units} />
            ) : null
          }
        >
          <b
            style={{
              fontSize: 15,
              color: r.balance < 0 ? C.dangerText : C.primary,
            }}
          >
            {q3(r.balance)}
          </b>
        </Tooltip>
      ),
    },
    {
      title: t("ByUnits"),
      key: "units",
      width: 200,
      render: (_, r) =>
        unitsText(
          r.balance,
          r.units,
          nameOf,
          locale === "ar" ? " و " : " + ",
        ) || "—",
    },
    {
      title: t("AvgCost"),
      key: "cost",
      width: 100,
      render: (_, r) => money(r.cost),
    },
    {
      title: t("StockValue"),
      key: "value",
      width: 120,
      render: (_, r) => <b>{money(r.value)}</b>,
    },
  ];
  const width = columns.reduce((s, c) => s + c.width, 0);
  const tot = data.totals ?? {};

  // التصدير: كل الأصناف حسب الفلتر (مش الصفحة الظاهرة بس)
  const loadAll = async () => {
    const res = await getStockMovementReportAction({ ...filters, all: true });
    if (!res.success) {
      message.error(tAlerts(res.error));
      return null;
    }
    return res.data;
  };
  const build = (all) => ({
    title: t("MovementReportTitle"),
    fileName: "stock-movement",
    landscape: true,
    info: [
      [t("Warehouse"), warehouseLabel],
      [
        t("Period"),
        filters.from || filters.to
          ? `${formatDay(filters.from) || "…"} — ${formatDay(filters.to) || "…"}`
          : t("AllTime"),
      ],
    ],
    columns: [
      { title: t("Code"), key: "code" },
      { title: t("Item"), key: "name" },
      { title: t("OpeningBalance"), key: "opening", type: "number" },
      ...MOVES.map(([k]) => ({
        title: t(`Movement.${k}`),
        key: k,
        type: "number",
      })),
      { title: t("RemainingBalance"), key: "balance", type: "number" },
      { title: t("ByUnits"), key: "units" },
      { title: t("AvgCost"), key: "cost", type: "money" },
      { title: t("StockValue"), key: "value", type: "money" },
    ],
    rows: all.rows.map((r) => ({
      key: r.id,
      code: r.code,
      name: nameOf(r),
      opening: q3(r.opening),
      ...Object.fromEntries(MOVES.map(([k]) => [k, q3(r[k])])),
      balance: q3(r.balance),
      units: unitsText(
        r.balance,
        r.units,
        nameOf,
        locale === "ar" ? " و " : " + ",
      ),
      cost: r.cost,
      value: r.value,
    })),
    totals: {
      opening: q3(all.totals.opening),
      ...Object.fromEntries(MOVES.map(([k]) => [k, q3(all.totals[k])])),
      balance: q3(all.totals.balance),
      value: all.totals.value,
    },
  });

  return (
    <>
      <div className="flex justify-end mb-2">
        <ExportButtons disabled={!data.total} loadAll={loadAll} build={build} />
      </div>
      <Table
        bordered
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data.rows}
        tableLayout="fixed"
        scroll={{ x: width }}
        onRow={(r) => ({ onClick: () => onOpenCard?.(r) })}
        pagination={{
          current: page,
          pageSize: data.pageSize,
          total: data.total,
          showSizeChanger: false,
          onChange: setPage,
        }}
        summary={() =>
          data.total ? (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: C.primarySoft }}>
                <Table.Summary.Cell index={0} colSpan={2}>
                  <b>
                    {t("Total")} ({data.total})
                  </b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2}>
                  <b>{q3(tot.opening)}</b>
                </Table.Summary.Cell>
                {MOVES.map(([k, color], i) => (
                  <Table.Summary.Cell key={k} index={3 + i}>
                    <b style={{ color }}>{q3(tot[k])}</b>
                  </Table.Summary.Cell>
                ))}
                <Table.Summary.Cell index={12}>
                  <b>{q3(tot.balance)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={13} />
                <Table.Summary.Cell index={14} />
                <Table.Summary.Cell index={15}>
                  <b>{money(tot.value ?? 0)}</b>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          ) : null
        }
      />
    </>
  );
}
