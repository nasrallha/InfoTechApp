"use client";

import { useEffect, useRef, useState } from "react";
import { Segmented, Select, Space, Switch, Table, Tag, Tooltip } from "antd";
import { message } from "@/components/common/feedback";
import { useLocale, useTranslations } from "next-intl";
import { getStockBalancesAction } from "@/actions/inventory.actions";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PageHeader from "@/components/common/PageHeader";
import SearchBox from "@/components/common/SearchBox";
import DayPicker from "@/components/common/DayPicker";
import ItemCard from "./ItemCard";
import StockMovementTable from "./StockMovementTable";
import UnitBreakdown from "./UnitBreakdown";
import { listSep } from "@/lib/list-sep";
import { C } from "@/lib/theme";
import "@/components/common/table.css";

const qty = (v) => Number(Number(v ?? 0).toFixed(3));

// ============================================================
// أرصدة المخزون
// - مستودع واحد أو كل المستودعات المسموحة (عمود لكل مستودع + الإجمالي)
// - بحث بالاسم/الكود/الباركود، فلتر بالقسم، والأصناف بالسالب فقط
// - الضغط على صنف يفتح كارت الصنف (حركاته)
// warehouses: المستودعات المسموحة للمستخدم
// ============================================================
export default function StockView({ warehouses = [], categories = [] }) {
  const [warehouseId, setWarehouseId] = useState(
    warehouses.length === 1 ? warehouses[0].id : undefined,
  );
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState();
  const [onlyNegative, setOnlyNegative] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, pageSize: 50 });
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState(null);
  // العرض: الأرصدة الحالية / حركة المخزون (افتتاحي + كل الحركات + المتبقي)
  const [mode, setMode] = useState("balances");
  const [from, setFrom] = useState();
  const [to, setTo] = useState();
  const [hideIdle, setHideIdle] = useState(false);
  const requestId = useRef(0);

  const locale = useLocale();
  const t = useTranslations("Inventory");
  const tSidebar = useTranslations("Sidebar");
  const tAlerts = useTranslations("Alerts");
  const { amount: money } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  // المستودع + الفرع المربوط بيه (لمدير النظام)
  const warehouseLabel = (w) => {
    const branches = (w.branches ?? []).map(nameOf).filter(Boolean);
    return branches.length
      ? `${nameOf(w)} - ${branches.join(listSep(locale))}`
      : nameOf(w);
  };

  useEffect(() => {
    if (mode !== "balances") return undefined;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await getStockBalancesAction({
        warehouseId,
        q,
        categoryId,
        onlyNegative,
        page,
      });
      if (id !== requestId.current) return;
      setLoading(false);
      if (!res.success) return message.error(tAlerts(res.error));
      setData(res.data);
    }, 250);
    return () => clearTimeout(timer);
  }, [mode, warehouseId, q, categoryId, onlyNegative, page, tAlerts]);

  // المستودعات المعروضة كأعمدة (لو "الكل" وأكثر من مستودع)
  const shown = warehouseId
    ? warehouses.filter((w) => w.id === warehouseId)
    : warehouses;
  const perWarehouse = !warehouseId && warehouses.length > 1;

  const qtyCell = (v) => (
    <b
      className={v < 0 ? "text-red-600" : v === 0 ? "text-gray-400" : undefined}
    >
      {qty(v)}
    </b>
  );

  const columns = [
    {
      title: t("Item"),
      key: "item",
      width: 240,
      render: (_, r) => (
        <div style={{ cursor: "pointer" }}>
          <div style={{ fontWeight: 600 }}>
            {nameOf(r)}
            {!r.isActive && (
              <Tag className="ms-2" color="default">
                {t("Inactive")}
              </Tag>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>
            <bdi>{r.code}</bdi>
            {r.category && <> · {nameOf(r.category)}</>}
          </div>
        </div>
      ),
    },
    {
      title: t("BaseUnit"),
      key: "unit",
      width: 100,
      render: (_, r) => nameOf(r.unit),
    },
    ...(perWarehouse
      ? shown.map((w) => ({
          title: nameOf(w),
          key: `w${w.id}`,
          width: 110,
          render: (_, r) => (
            <Tooltip
              title={
                r.units.length > 1 ? (
                  <UnitBreakdown
                    qty={r.byWarehouse[w.id] ?? 0}
                    units={r.units}
                  />
                ) : null
              }
            >
              {qtyCell(r.byWarehouse[w.id] ?? 0)}
            </Tooltip>
          ),
        }))
      : []),
    {
      title: perWarehouse ? t("TotalQty") : t("Qty"),
      key: "total",
      width: 110,
      render: (_, r) => qtyCell(r.totalQty),
    },
    // نفس الكمية بالكرتونة والشدة والحبة (حسب معامل التحويل)
    {
      title: t("ByUnits"),
      key: "byUnits",
      width: 230,
      render: (_, r) => <UnitBreakdown qty={r.totalQty} units={r.units} />,
    },
    {
      title: t("Cost"),
      key: "cost",
      width: 110,
      render: (_, r) => money(r.cost),
    },
    {
      title: t("StockValue"),
      key: "value",
      width: 130,
      render: (_, r) => money(r.totalQty * r.cost),
    },
  ];
  const width = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div>
      <PageHeader title={tSidebar("Stock")} />

      <Segmented
        className="mb-3"
        value={mode}
        onChange={setMode}
        options={[
          { value: "balances", label: t("ModeBalances") },
          { value: "movement", label: t("ModeMovement") },
        ]}
      />

      <Space wrap className="mb-3">
        {warehouses.length > 1 && (
          <Select
            allowClear
            style={{ width: 220 }}
            placeholder={t("AllWarehouses")}
            value={warehouseId}
            onChange={(v) => {
              setWarehouseId(v);
              setPage(1);
            }}
            options={warehouses.map((w) => ({
              value: w.id,
              label: warehouseLabel(w),
            }))}
          />
        )}
        <SearchBox
          width={320}
          placeholder={t("SearchItems")}
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          onSearch={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 220 }}
          placeholder={t("AllCategories")}
          value={categoryId}
          onChange={(v) => {
            setCategoryId(v);
            setPage(1);
          }}
          options={categories.map((c) => ({
            value: c.id,
            label: c.parent ? `${nameOf(c.parent)} / ${nameOf(c)}` : nameOf(c),
          }))}
        />
        {mode === "balances" ? (
          <Space>
            <Switch
              checked={onlyNegative}
              onChange={(v) => {
                setOnlyNegative(v);
                setPage(1);
              }}
            />
            <span>{t("OnlyNegative")}</span>
          </Space>
        ) : (
          <>
            {/* الفترة: من غير تحديد = كل الحركات لحد النهارده */}
            <DayPicker
              allowClear
              placeholder={t("FromDate")}
              value={from}
              onChange={setFrom}
              style={{ width: 150 }}
            />
            <DayPicker
              allowClear
              placeholder={t("ToDate")}
              value={to}
              onChange={setTo}
              style={{ width: 150 }}
            />
            <Space>
              <Switch checked={hideIdle} onChange={setHideIdle} />
              <span>{t("HideIdle")}</span>
            </Space>
          </>
        )}
      </Space>

      {!warehouses.length && (
        <div className="text-red-600 mb-3">
          {tAlerts("NoWarehouseForBranch")}
        </div>
      )}

      {mode === "movement" ? (
        <StockMovementTable
          filters={{
            warehouseId,
            q,
            categoryId,
            from: from || undefined,
            to: to || undefined,
            hideIdle,
          }}
          warehouseLabel={
            warehouseId
              ? warehouseLabel(
                  warehouses.find((w) => w.id === warehouseId) ?? {},
                )
              : t("AllWarehouses")
          }
          onOpenCard={setCard}
        />
      ) : (
        <Table
          bordered
          size="small"
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={data.rows}
          tableLayout="fixed"
          scroll={{ x: width }}
          onRow={(r) => ({ onClick: () => setCard(r) })}
          pagination={{
            current: page,
            pageSize: data.pageSize,
            total: data.total,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
      )}

      <ItemCard
        product={card}
        warehouseId={warehouseId}
        onClose={() => setCard(null)}
      />
    </div>
  );
}
