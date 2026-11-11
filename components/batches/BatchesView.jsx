"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Card,
  Col,
  InputNumber,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
} from "antd";
import { DeleteOutlined, PrinterOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import DayPicker from "@/components/common/DayPicker";
import ExportButtons from "@/components/reports/ExportButtons";
import { usePathname, useRouter } from "@/i18n/routing";
import { formatDay } from "@/lib/dates";
import { qtyText } from "@/lib/unit-qty";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PageHeader from "@/components/common/PageHeader";
import SearchBox from "@/components/common/SearchBox";
import { C } from "@/lib/theme";
import { message, modal } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { disposeBatchesAction } from "@/actions/inventory.actions";
import BatchCard from "./BatchCard";
import "@/components/common/table.css";

const STATUS_COLOR = {
  expired: "red",
  near: "orange",
  ok: "green",
  none: "default",
};

// ============================================================
// تقرير الصلاحية والدفعات: كل دفعة فيها رصيد، وحالتها
// - قرب الانتهاء: خلال أسبوع / شهر / أيام تكتبها (أو أيام تنبيه الصنف)
// - المنتهي
// - تاريخ الانتهاء: من / إلى (قبل تاريخ = "إلى" بس، وفي يوم معيّن = نفس اليوم في الاتنين)
// الفلاتر في الرابط (?warehouse=&status=&days=&q=&from=&to=)
// تصدير Excel / PDF / طباعة بنفس الفلاتر
// ============================================================
export default function BatchesView({
  data,
  warehouses,
  filters,
  canDispose = false,
  canPrint = false,
}) {
  const t = useTranslations("BatchesReport");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { amount: money } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [search, setSearch] = useState(filters.q ?? "");
  const [days, setDays] = useState(filters.days);
  const tAlerts = useTranslations("Alerts");
  const [busy, startBusy] = useTransition();
  const [cardId, setCardId] = useState(null);

  // إتلاف دفعات: مستند تالف تلقائي (لكل مستودع)
  const dispose = (rows) =>
    modal.confirm({
      title: t("DisposeConfirm", { count: rows.length }),
      content: t("DisposeHint"),
      okButtonProps: { danger: true },
      okText: t("Dispose"),
      onOk: () =>
        new Promise((resolve) =>
          startBusy(async () => {
            const res = await disposeBatchesAction({
              batchIds: rows.map((r) => r.id),
              reason: t("DisposeReason"),
            });
            resolve();
            if (!res.success) return showActionError(res, tAlerts, locale);
            message.success(t("Disposed"));
          }),
        ),
    });
  const expiredRows = data.rows.filter((r) => r.status === "expired");

  const go = (patch) => {
    const f = { ...filters, ...patch };
    const query = new URLSearchParams();
    if (f.warehouseId) query.set("warehouse", String(f.warehouseId));
    if (f.status && f.status !== "all") query.set("status", f.status);
    if (f.days) query.set("days", String(f.days));
    if (f.q) query.set("q", f.q);
    if (f.from) query.set("from", f.from);
    if (f.to) query.set("to", f.to);
    const qs = query.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  // نص المتبقي (للجدول والتصدير)
  const leftText = (r) =>
    r.daysLeft == null
      ? t("status.none")
      : r.daysLeft < 0
        ? t("ExpiredSince", { days: -r.daysLeft })
        : r.daysLeft === 0
          ? t("ExpiresToday")
          : t("DaysLeftN", { days: r.daysLeft });

  const columns = [
    {
      title: t("Item"),
      key: "item",
      width: 230,
      render: (_, r) => (
        <div>
          <div className="font-bold">{nameOf(r.product)}</div>
          <div className="text-xs text-slate-500">
            <bdi>{r.product.code}</bdi>
          </div>
        </div>
      ),
    },
    {
      title: t("BatchNo"),
      key: "batch",
      width: 130,
      // الضغط ← كارت الدفعة (حركاتها)
      render: (_, r) => (
        <Button type="link" size="small" className="p-0" onClick={() => setCardId(r.id)}>
          <bdi>{r.batchNo === "-" ? t("NoBatch") : r.batchNo}</bdi>
        </Button>
      ),
    },
    {
      title: t("Warehouse"),
      key: "wh",
      width: 140,
      ellipsis: true,
      render: (_, r) => nameOf(r.warehouse),
    },
    {
      title: t("MfgDate"),
      key: "mfg",
      width: 110,
      align: "center",
      render: (_, r) => (r.mfgDate ? <bdi>{formatDay(r.mfgDate)}</bdi> : "—"),
    },
    {
      title: t("ExpDate"),
      key: "exp",
      width: 110,
      align: "center",
      render: (_, r) => (r.expDate ? <bdi>{formatDay(r.expDate)}</bdi> : "—"),
    },
    {
      title: t("DaysLeft"),
      key: "days",
      width: 120,
      align: "center",
      render: (_, r) => (
        <Tag color={STATUS_COLOR[r.status]}>{leftText(r)}</Tag>
      ),
    },
    {
      title: t("Qty"),
      key: "qty",
      width: 110,
      align: "center",
      render: (_, r) => `${qtyText(r.qty)} ${nameOf(r.product.unit)}`,
    },
    {
      title: t("Value"),
      key: "value",
      width: 110,
      align: "end",
      render: (_, r) => money(r.value),
    },
    ...(canDispose || canPrint
      ? [
          {
            title: "",
            key: "actions",
            width: canDispose && canPrint ? 90 : 60,
            align: "center",
            render: (_, r) => (
              <Space size={4}>
                {/* ملصقات الدفعة (عددها = رصيدها) */}
                {canPrint && (
                  <Button
                    size="small"
                    icon={<PrinterOutlined />}
                    title={t("PrintLabels")}
                    onClick={() =>
                      router.push(`/printing/barcodes?batches=${r.id}`)
                    }
                  />
                )}
                {canDispose && (
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    title={t("Dispose")}
                    disabled={busy}
                    onClick={() => dispose([r])}
                  />
                )}
              </Space>
            ),
          },
        ]
      : []),
  ];
  const TABLE_WIDTH = columns.reduce((s, c) => s + c.width, 0);

  // التصدير: الصفوف المعروضة بنفس الفلاتر، والفلاتر مكتوبة في رأس التقرير
  const buildExport = () => {
    const wh = warehouses.find((w) => w.id === filters.warehouseId);
    const day = (d) => (d ? formatDay(d) : "...");
    return {
      title: t("Title"),
      fileName: "expiry-batches",
      info: [
        [t("StatusLabel"), t(`status.${filters.status}`)],
        ...(filters.status === "near" && filters.days
          ? [[t("NearWithin"), t("DaysN", { days: filters.days })]]
          : []),
        ...(filters.from || filters.to
          ? [[t("ExpPeriod"), `${day(filters.from)} - ${day(filters.to)}`]]
          : []),
        [t("Warehouse"), wh ? nameOf(wh) : t("AllWarehouses")],
        ...(filters.q ? [[t("SearchLabel"), filters.q]] : []),
        [t("BatchesCount"), String(data.rows.length)],
      ],
      columns: [
        { title: t("Code"), key: "code", type: "text", width: 14 },
        { title: t("Item"), key: "item", type: "text", width: 30 },
        { title: t("BatchNo"), key: "batch", type: "text", width: 14 },
        { title: t("Warehouse"), key: "wh", type: "text", width: 16 },
        { title: t("MfgDate"), key: "mfg", type: "text", width: 12 },
        { title: t("ExpDate"), key: "exp", type: "text", width: 12 },
        { title: t("DaysLeft"), key: "left", type: "text", width: 16 },
        { title: t("Qty"), key: "qty", type: "qty" },
        { title: t("Unit"), key: "unit", type: "text", width: 10 },
        { title: t("Value"), key: "value", type: "money" },
      ],
      rows: data.rows.map((r) => ({
        key: r.id,
        code: r.product.code,
        item: nameOf(r.product),
        batch: r.batchNo === "-" ? t("NoBatch") : r.batchNo,
        wh: nameOf(r.warehouse),
        mfg: r.mfgDate ? formatDay(r.mfgDate) : "",
        exp: r.expDate ? formatDay(r.expDate) : "",
        left: leftText(r),
        qty: r.qty,
        unit: nameOf(r.product.unit),
        value: r.value,
      })),
      totals: { value: data.rows.reduce((s, r) => s + r.value, 0) },
    };
  };

  return (
    <div>
      <PageHeader
        title={t("Title")}
        extra={
          <Space wrap>
            <ExportButtons build={buildExport} disabled={!data.rows.length} />
            {canDispose && expiredRows.length > 0 && (
              <Button
                danger
                icon={<DeleteOutlined />}
                loading={busy}
                onClick={() => dispose(expiredRows)}
              >
                {t("DisposeAllExpired", { count: expiredRows.length })}
              </Button>
            )}
          </Space>
        }
      />

      <Row gutter={[12, 12]} className="mb-3">
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t("NearCount")}
              value={data.totals.near.count}
              styles={{ content: { color: C.warningText } }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t("NearValue")}
              value={money(data.totals.near.value)}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t("ExpiredCount")}
              value={data.totals.expired.count}
              styles={{ content: { color: C.dangerText } }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t("ExpiredValue")}
              value={money(data.totals.expired.value)}
            />
          </Card>
        </Col>
      </Row>

      <div className="cp-filters mb-3">
        <Space wrap align="center">
          <Segmented
            value={filters.status}
            onChange={(v) => go({ status: v })}
            options={[
              { value: "all", label: t("status.all") },
              { value: "near", label: t("status.near") },
              { value: "expired", label: t("status.expired") },
            ]}
          />
          {/* قرب الانتهاء: خلال أسبوع / شهر / أيام */}
          <Segmented
            value={filters.days === 7 ? 7 : filters.days === 30 ? 30 : "custom"}
            onChange={(v) =>
              v === "custom" ? null : go({ status: "near", days: v })
            }
            options={[
              { value: 7, label: t("Week") },
              { value: 30, label: t("Month") },
              { value: "custom", label: t("Custom") },
            ]}
          />
          <Space.Compact>
            <InputNumber
              min={1}
              max={3650}
              placeholder={String(data.defaultDays)}
              value={days}
              onChange={(v) => setDays(v ?? null)}
              style={{ width: 110 }}
            />
            <Button onClick={() => go({ status: "near", days: days || null })}>
              {t("Days")}
            </Button>
          </Space.Compact>
          {/* تاريخ الانتهاء: من / إلى */}
          <Space.Compact>
            <DayPicker
              allowClear
              placeholder={t("ExpFrom")}
              value={filters.from}
              max={filters.to ?? undefined}
              onChange={(v) => go({ from: v ?? null })}
              style={{ width: 150 }}
            />
            <DayPicker
              allowClear
              placeholder={t("ExpTo")}
              value={filters.to}
              min={filters.from ?? undefined}
              onChange={(v) => go({ to: v ?? null })}
              style={{ width: 150 }}
            />
          </Space.Compact>
          {warehouses.length > 1 && (
            <Select
              allowClear
              style={{ width: 200 }}
              placeholder={t("AllWarehouses")}
              value={filters.warehouseId ?? undefined}
              onChange={(v) => go({ warehouseId: v ?? null })}
              options={warehouses.map((w) => ({
                value: w.id,
                label: nameOf(w),
              }))}
            />
          )}
          <SearchBox
            width={280}
            placeholder={t("Search")}
            value={search}
            onChange={(v) => {
              setSearch(v);
              if (!v && filters.q) go({ q: "" });
            }}
            onSearch={(v) => go({ q: v.trim() })}
          />
        </Space>
      </div>

      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={data.rows}
        tableLayout="fixed"
        scroll={{ x: TABLE_WIDTH }}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        locale={{ emptyText: t("Empty") }}
      />
      <BatchCard batchId={cardId} onClose={() => setCardId(null)} />
    </div>
  );
}
