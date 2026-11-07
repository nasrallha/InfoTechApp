"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Col, Input, Row, Segmented, Select, Table, Tag } from "antd";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import DayPicker from "@/components/common/DayPicker";
import ExportButtons from "@/components/reports/ExportButtons";
import { showActionError } from "@/components/common/actionError";
import { Link } from "@/i18n/routing";
import { formatDate } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import { warrantyReportAction } from "@/actions/serial.actions";
import WarrantyBadge, { warrantyDaysLeft } from "./WarrantyBadge";
import { C } from "@/lib/theme";

const STATUSES = ["active", "expiring", "expired", "all"];

// ============================================================
// تقرير الضمانات: القطع المباعة بضمان (ساري / قرّب يخلص / منتهي)
// فلاتر: الحالة، بحث (رقم أو صنف)، العميل، فترة البيع
// ============================================================
export default function WarrantyReportView({
  customers = [],
  initialCustomerId,
  initialStatus = "active",
}) {
  const t = useTranslations("Serials");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [filters, setFilters] = useState({
    status: initialStatus,
    q: "",
    customerId: initialCustomerId,
    from: undefined,
    to: undefined,
  });
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  // النتيجة ومعاها مفتاح الفلاتر اللي جابتها (التحميل = المفتاح اتغير)
  const [result, setResult] = useState({
    key: null,
    data: { total: 0, rows: [] },
  });

  const load = useCallback(
    async (extra = {}) => {
      const res = await warrantyReportAction({
        ...filters,
        page,
        pageSize,
        ...extra,
      });
      if (!res.success) {
        showActionError(res, tAlerts, locale);
        return null;
      }
      return res.data;
    },
    [filters, page, pageSize, tAlerts, locale],
  );

  const key = JSON.stringify({ filters, page, pageSize });
  const data = result.data;
  const loading = result.key !== key;
  useEffect(() => {
    let alive = true;
    load().then((d) => {
      if (!alive) return;
      setResult((prev) => ({ key, data: d ?? prev.data }));
    });
    return () => {
      alive = false;
    };
  }, [load, key]);

  const set = (patch) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...patch }));
  };

  const serialText = (r) =>
    r.serial2 ? `${r.serial} / ${r.serial2}` : r.serial;
  const warrantyText = (r) =>
    `${t("MonthsN", { n: r.warrantyMonths ?? 0 })} — ${t(`WarrantyType_${r.warrantyType ?? "store"}`)}`;
  const leftText = (r) => {
    const left = warrantyDaysLeft(r.warrantyEndsAt);
    return left == null
      ? ""
      : left < 0
        ? t("WarrantyExpiredAgo", { n: -left })
        : t("WarrantyActiveLeft", { n: left });
  };

  // التصدير (Excel / طباعة / PDF): كل الصفوف بنفس الفلاتر
  const build = (all) => ({
    title: t("ReportTitle"),
    fileName: "warranties",
    info: [
      [t("Status"), t(`Filter_${filters.status}`)],
      ...(filters.from || filters.to
        ? [[t("SoldPeriod"), `${filters.from ?? ""} — ${filters.to ?? ""}`]]
        : []),
    ],
    columns: [
      { title: t("DefaultLabel1"), key: "serial" },
      { title: t("Product"), key: "product" },
      { title: t("Customer"), key: "customer" },
      { title: t("Phone"), key: "phone" },
      { title: t("Invoice"), key: "invoice" },
      { title: t("SoldAt"), key: "soldAt" },
      { title: t("Warranty"), key: "warranty" },
      { title: t("WarrantyEnds"), key: "endsAt" },
      { title: t("Remaining"), key: "left" },
    ],
    rows: all.rows.map((r) => ({
      key: r.id,
      serial: serialText(r),
      product: `${nm(r.product)} (${r.product.code})`,
      customer: nm(r.customer) || t("CashCustomer"),
      phone: r.customer?.phone ?? "",
      invoice: r.sale ? saleDocNo("sale", r.sale.number) : "",
      soldAt: r.soldAt ? formatDate(r.soldAt) : "",
      warranty: warrantyText(r),
      endsAt: r.warrantyEndsAt ?? "",
      left: leftText(r),
    })),
  });

  return (
    <>
      <PageHeader
        title={t("ReportTitle")}
        subtitle={t("ReportSubtitle")}
        extra={
          <ExportButtons
            disabled={!data.total}
            loadAll={() => load({ all: true, page: 1 })}
            build={build}
          />
        }
      />
      <Card size="small" className="mb-3">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} lg={10}>
            <Segmented
              block
              value={filters.status}
              onChange={(v) => set({ status: v })}
              options={STATUSES.map((s) => ({
                value: s,
                label: t(`Filter_${s}`),
              }))}
            />
          </Col>
          <Col xs={24} sm={12} lg={5}>
            <Input.Search
              allowClear
              placeholder={t("ReportSearch")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onSearch={(v) => set({ q: v.trim() })}
            />
          </Col>
          <Col xs={24} sm={12} lg={5}>
            <Select
              allowClear
              showSearch
              style={{ width: "100%" }}
              placeholder={t("AllCustomers")}
              optionFilterProp="label"
              value={filters.customerId}
              onChange={(v) => set({ customerId: v ?? undefined })}
              options={customers.map((c) => ({
                value: c.id,
                label: `${c.code} - ${nm(c)}${c.phone ? ` (${c.phone})` : ""}`,
              }))}
            />
          </Col>
          <Col xs={12} lg={2}>
            <DayPicker
              allowClear
              placeholder={t("From")}
              value={filters.from}
              onChange={(v) => set({ from: v })}
            />
          </Col>
          <Col xs={12} lg={2}>
            <DayPicker
              allowClear
              placeholder={t("To")}
              value={filters.to}
              onChange={(v) => set({ to: v })}
            />
          </Col>
        </Row>
      </Card>

      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={data.rows}
        scroll={{ x: 1100 }}
        pagination={{
          current: page,
          pageSize,
          total: data.total,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100, 200],
          showTotal: (n) => t("TotalPieces", { n }),
          onChange: (p, s) => {
            setPage(s !== pageSize ? 1 : p);
            setPageSize(s);
          },
        }}
        columns={[
          {
            title: t("DefaultLabel1"),
            width: 200,
            render: (_, r) => (
              <Link href={`/serials?q=${encodeURIComponent(r.serial)}`}>
                <bdi>{serialText(r)}</bdi>
              </Link>
            ),
          },
          {
            title: t("Product"),
            width: 220,
            render: (_, r) => (
              <span>
                {nm(r.product)}{" "}
                <bdi style={{ color: C.muted }}>{r.product.code}</bdi>
                {r.isUsed && (
                  <Tag color="purple" className="ms-1">
                    {t("Used")}
                  </Tag>
                )}
              </span>
            ),
          },
          {
            title: t("Customer"),
            width: 200,
            render: (_, r) => (
              <span>
                {nm(r.customer) || t("CashCustomer")}
                {r.customer?.phone && (
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    <bdi>{r.customer.phone}</bdi>
                  </div>
                )}
              </span>
            ),
          },
          {
            title: t("Invoice"),
            width: 100,
            render: (_, r) =>
              r.sale ? (
                <Link href={`/invoices/sales/${r.sale.id}`}>
                  <bdi>{saleDocNo("sale", r.sale.number)}</bdi>
                </Link>
              ) : (
                "—"
              ),
          },
          {
            title: t("SoldAt"),
            width: 110,
            render: (_, r) =>
              r.soldAt ? <bdi>{formatDate(r.soldAt)}</bdi> : "—",
          },
          {
            title: t("Warranty"),
            width: 160,
            render: (_, r) => warrantyText(r),
          },
          {
            title: t("WarrantyEnds"),
            width: 110,
            render: (_, r) => <bdi>{r.warrantyEndsAt}</bdi>,
          },
          {
            title: t("Remaining"),
            width: 190,
            render: (_, r) => <WarrantyBadge endsAt={r.warrantyEndsAt} />,
          },
        ]}
      />
    </>
  );
}
