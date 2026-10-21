"use client";

import { useState } from "react";
import { Button, Select, Space, Table, Tag } from "antd";
import { DesktopOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { formatDateTime, formatDay, today } from "@/lib/dates";
import {
  formatDocNo,
  paymentStatus,
  PAYMENT_STATUS_COLOR,
  saleDocNo,
} from "@/lib/doc-number";
import { useCurrency } from "@/components/common/CurrencyProvider";
import SearchBox from "@/components/common/SearchBox";
import "@/components/common/table.css";
import "@/components/purchases/purchases.css";

const BASE = {
  sale: "/invoices/sales",
  return: "/invoices/sales-returns",
  quotation: "/invoices/quotations",
};

// ============================================================
// قائمة فواتير البيع / مرتجعات المبيعات / عروض الأسعار
// kind: "sale" | "return" | "quotation"
// البحث: الرقم أو اسم العميل (في الرابط ?q=...&page=...&branch=...)
// ============================================================
export default function SalesList({
  kind,
  data,
  q,
  canCreate,
  canPos,
  branches,
  branchId,
}) {
  const [search, setSearch] = useState(q ?? "");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Sales");
  const tP = useTranslations("Purchases");
  const tTable = useTranslations("Table");
  const { amount: money } = useCurrency();
  const basePath = BASE[kind];
  const isQuotation = kind === "quotation";
  const isReturn = kind === "return";
  const todayDay = today();

  const go = (params) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.page > 1) query.set("page", String(params.page));
    const branch = params.branch === undefined ? branchId : params.branch;
    if (branch) query.set("branch", String(branch));
    const qs = query.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const docNo = (r) =>
    isQuotation
      ? formatDocNo("quotation", r.number)
      : saleDocNo(kind, r.number);
  const customerOf = (r) =>
    (locale === "ar" ? r.customerArName : r.customerEnName) ||
    t("CashCustomer");

  const columns = [
    {
      title: isQuotation
        ? t("QuotationNo")
        : isReturn
          ? t("ReturnNo")
          : t("SaleNo"),
      key: "number",
      width: 110,
      align: "center",
      render: (_, r) => (
        <Link href={`${basePath}/${r.id}`}>
          <b>
            <bdi>{docNo(r)}</bdi>
          </b>
        </Link>
      ),
    },
    {
      title: t("Date"),
      key: "date",
      width: 150,
      align: "center",
      render: (_, r) => <bdi>{formatDateTime(r.date)}</bdi>,
    },
    {
      title: t("Customer"),
      key: "customer",
      width: 220,
      ellipsis: true,
      render: (_, r) => customerOf(r),
    },
    ...(isQuotation
      ? [
          {
            title: t("ValidUntil"),
            key: "valid",
            width: 120,
            align: "center",
            render: (_, r) => (
              <bdi
                className={
                  r.status === "open" && r.validUntil < todayDay
                    ? "text-red-600"
                    : undefined
                }
              >
                {formatDay(r.validUntil)}
              </bdi>
            ),
          },
          {
            title: tTable("Status"),
            key: "status",
            width: 150,
            align: "center",
            render: (_, r) =>
              r.status === "converted" ? (
                <Link href={`/invoices/sales/${r.sale?.id}`}>
                  <Tag color="green">
                    {t("Converted")}{" "}
                    {r.sale && saleDocNo("sale", r.sale.number)}
                  </Tag>
                </Link>
              ) : r.validUntil < todayDay ? (
                <Tag color="red">{t("Expired")}</Tag>
              ) : (
                <Tag color="blue">{t("Open")}</Tag>
              ),
          },
        ]
      : [
          {
            title: t("Source"),
            key: "source",
            width: 100,
            align: "center",
            render: (_, r) =>
              r.source === "pos" ? (
                <Tag color="geekblue">{t("Pos")}</Tag>
              ) : (
                <Tag>{t("Invoice")}</Tag>
              ),
          },
          ...(isReturn
            ? [
                {
                  title: tP("OriginalInvoice"),
                  key: "original",
                  width: 120,
                  align: "center",
                  render: (_, r) =>
                    r.returnOf && (
                      <Link href={`/invoices/sales/${r.returnOf.id}`}>
                        {saleDocNo("sale", r.returnOf.number)}
                      </Link>
                    ),
                },
              ]
            : []),
        ]),
    {
      title: tP("Total"),
      key: "total",
      width: 120,
      align: "end",
      render: (_, r) => <b>{money(r.totalAmount)}</b>,
    },
    ...(!isQuotation && !isReturn
      ? [
          {
            title: tP("PaymentStatusTitle"),
            key: "pay",
            width: 120,
            align: "center",
            render: (_, r) => {
              const st = paymentStatus(
                r.totalAmount,
                r.paidAmount + (r.settledAmount ?? 0),
              );
              return (
                <Tag color={PAYMENT_STATUS_COLOR[st]}>
                  {tP(`paymentStatus.${st}`)}
                </Tag>
              );
            },
          },
          {
            title: tP("Returns"),
            key: "returns",
            width: 90,
            align: "center",
            render: (_, r) =>
              r._count?.returns > 0 ? (
                <Tag color="orange">{r._count.returns}</Tag>
              ) : (
                "—"
              ),
          },
        ]
      : []),
    ...(!isQuotation
      ? [
          {
            title: t("Cashier"),
            key: "user",
            width: 150,
            ellipsis: true,
            render: (_, r) =>
              locale === "ar"
                ? r.createdBy?.arFullname
                : r.createdBy?.enFullname,
          },
        ]
      : []),
    {
      title: tTable("Actions"),
      key: "actions",
      width: 80,
      align: "center",
      render: (_, r) => (
        <Link href={`${basePath}/${r.id}`}>
          <Button size="small" icon={<EyeOutlined />} />
        </Link>
      ),
    },
  ];
  const TABLE_WIDTH = columns.reduce((s, c) => s + c.width, 0);

  const title = isQuotation
    ? t("QuotationsList")
    : isReturn
      ? t("ReturnsList")
      : t("SalesList");
  const newLabel = isQuotation
    ? t("NewQuotation")
    : isReturn
      ? t("NewReturn")
      : t("NewSale");

  return (
    <div className="pur">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{title}</h1>
        <Space wrap>
          {kind === "sale" && canPos && (
            <Link href="/pos">
              <Button size="large" icon={<DesktopOutlined />}>
                {t("OpenPos")}
              </Button>
            </Link>
          )}
          {canCreate && (
            <Link href={`${basePath}/new`}>
              <Button type="primary" size="large" icon={<PlusOutlined />}>
                {newLabel}
              </Button>
            </Link>
          )}
        </Space>
      </div>

      <Space wrap className="mb-3" align="start">
        <SearchBox
          width={420}
          placeholder={t("ListSearch")}
          value={search}
          onChange={(v) => {
            setSearch(v);
            if (!v && q) go({ q: "", page: 1 });
          }}
          onSearch={(v) => go({ q: v.trim(), page: 1 })}
        />
        {branches && (
          <Select
            allowClear
            style={{ width: 220 }}
            placeholder={tP("AllBranches")}
            value={branchId ?? undefined}
            onChange={(v) => go({ q, page: 1, branch: v ?? null })}
            options={branches.map((b) => ({
              value: b.id,
              label: locale === "ar" ? b.arName : b.enName,
            }))}
          />
        )}
      </Space>

      <Table
        bordered
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={data.rows}
        tableLayout="fixed"
        scroll={{ x: TABLE_WIDTH }}
        pagination={{
          current: data.page,
          pageSize: data.pageSize,
          total: data.total,
          showSizeChanger: false,
          onChange: (page) => go({ q, page }),
        }}
      />
    </div>
  );
}
