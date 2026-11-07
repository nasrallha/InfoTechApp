"use client";

import { Alert, Card, Col, Row, Table } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { formatDay } from "@/lib/dates";
import ExportButtons from "./ExportButtons";
import { C } from "@/lib/theme";
import "./report.css";

// كارت رقم في أعلى التقرير
export function Kpi({ title, value, hint, color = C.navy, strong }) {
  return (
    <Card
      size="small"
      className="report-kpi"
      style={{
        borderInlineStart: `4px solid ${color}`,
        background: strong ? color : undefined,
      }}
    >
      <div
        className="report-kpi__title"
        style={strong ? { color: "#fff" } : undefined}
      >
        {title}
      </div>
      <div
        className="report-kpi__value"
        style={{ color: strong ? "#fff" : color }}
      >
        <bdi>{value}</bdi>
      </div>
      {hint != null && (
        <div
          className="report-kpi__hint"
          style={strong ? { color: C.border } : undefined}
        >
          {hint}
        </div>
      )}
    </Card>
  );
}

export function KpiRow({ items }) {
  return (
    <Row gutter={[12, 12]} className="mb-4">
      {items.filter(Boolean).map((k) => (
        <Col
          key={k.title}
          xs={12}
          md={8}
          xl={Math.max(4, Math.floor(24 / items.filter(Boolean).length))}
        >
          <Kpi {...k} />
        </Col>
      ))}
    </Row>
  );
}

// رأس التقرير: العنوان + أزرار التصدير
export function ReportHeader({ title, build, truncated }) {
  const t = useTranslations("Reports");
  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
        <h1 className="font-bold text-xl">{title}</h1>
        <ExportButtons build={build} />
      </div>
      {truncated && (
        <Alert
          className="mb-3"
          type="warning"
          showIcon
          title={t("Truncated")}
        />
      )}
    </>
  );
}

// سطور معلومات الفلاتر للطباعة و Excel
export function useFilterInfo(filters, options = {}) {
  const t = useTranslations("Reports");
  const locale = useLocale();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const un = (x) => (x ? (locale === "ar" ? x.arFullname : x.enFullname) : "");
  const find = (list, id) => list?.find((x) => x.id === id);
  return () =>
    [
      [
        t("Period"),
        `${formatDay(filters.from)}${filters.fromTime ? ` ${filters.fromTime}` : ""} - ${formatDay(filters.to)}${filters.toTime ? ` ${filters.toTime}` : ""}`,
      ],
      filters.year && [
        t("Year"),
        filters.qtr
          ? `${filters.year} - ${t(`quarters.q${filters.qtr}`)}`
          : String(filters.year),
      ],
      filters.branchId && [
        t("Branch"),
        nm(find(options.branches, filters.branchId)),
      ],
      filters.userId && [t("User"), un(find(options.users, filters.userId))],
      filters.customerId && [
        t("Customer"),
        nm(find(options.customers, filters.customerId)),
      ],
      filters.supplierId && [
        t("Supplier"),
        nm(find(options.suppliers, filters.supplierId)),
      ],
      filters.paymentMethodId && [
        t("PaymentMethod"),
        nm(find(options.methods, filters.paymentMethodId)),
      ],
      filters.categoryId && [
        t("Category"),
        nm(find(options.categories, filters.categoryId)),
      ],
      filters.source && [
        t("Source"),
        t(filters.source === "pos" ? "SourcePos" : "SourceInvoice"),
      ],
      filters.q && [t("DocNo"), filters.q],
    ].filter(Boolean);
}

// سطر الإجمالي في آخر جدول الفواتير
// values: { مفتاح العمود: القيمة المعروضة } — أول عمود له قيمة يبدأ عنده الإجمالي
export function DocsTotal({ columns, label, values }) {
  const first = columns.findIndex((c) => values[c.key] !== undefined);
  return (
    <Table.Summary.Row style={{ background: C.bg, fontWeight: 800 }}>
      <Table.Summary.Cell index={0} colSpan={first}>
        {label}
      </Table.Summary.Cell>
      {columns.slice(first).map((c, i) => (
        <Table.Summary.Cell key={c.key} index={first + i} align="end">
          {values[c.key] ?? ""}
        </Table.Summary.Cell>
      ))}
    </Table.Summary.Row>
  );
}
