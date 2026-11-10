"use client";

import { useState } from "react";
import { Button, Segmented, Select, Space, Table, Tag, Tooltip } from "antd";
import {
  EyeOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { purchaseDocNo, saleDocNo } from "@/lib/doc-number";
import { useCurrency } from "@/components/common/CurrencyProvider";
import SearchBox from "@/components/common/SearchBox";
import "@/components/common/table.css";
import "@/components/purchases/purchases.css";

export const NOTE_BASE = {
  sale: "/invoices/sales-notes",
  purchase: "/invoices/purchase-notes",
};
export const INVOICE_BASE = {
  sale: "/invoices/sales",
  purchase: "/invoices/purchases",
};
export const NOTE_COLOR = { credit: "gold", debit: "cyan" };
const ZATCA_COLOR = {
  reported: "green",
  cleared: "green",
  pending: "blue",
  error: "orange",
  rejected: "red",
};

// ============================================================
// قائمة الإشعارات الدائنة والمدينة (العملاء / الموردين)
// الفلاتر في الرابط: ?type=credit|debit&q=&page=&branch=
// ============================================================
export default function NotesList({
  side,
  data,
  q,
  type,
  canCreate,
  branches,
  branchId,
}) {
  const [search, setSearch] = useState(q ?? "");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Notes");
  const tZ = useTranslations("Zatca");
  const tTable = useTranslations("Table");
  const tButtons = useTranslations("Buttons");
  const { amount: money } = useCurrency();
  const isSale = side === "sale";
  const base = NOTE_BASE[side];
  const docNo = isSale ? saleDocNo : purchaseDocNo;

  const go = (params) => {
    const query = new URLSearchParams();
    const nextType = params.type === undefined ? type : params.type;
    if (nextType) query.set("type", nextType);
    if (params.q) query.set("q", params.q);
    if (params.page > 1) query.set("page", String(params.page));
    const branch = params.branch === undefined ? branchId : params.branch;
    if (branch) query.set("branch", String(branch));
    const qs = query.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const partyOf = (r) =>
    (locale === "ar" ? r.partyArName : r.partyEnName) ||
    (isSale ? t("CashCustomer") : "");

  const columns = [
    {
      title: t("NoteNo"),
      key: "number",
      width: 110,
      align: "center",
      render: (_, r) => (
        <Link href={`${base}/${r.id}`}>
          <b>
            <bdi>{docNo(r.type, r.number)}</bdi>
          </b>
        </Link>
      ),
    },
    {
      title: t("Type"),
      key: "type",
      width: 110,
      align: "center",
      render: (_, r) => (
        <Tag color={NOTE_COLOR[r.type]}>{t(`type.${r.type}`)}</Tag>
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
      title: isSale ? t("Customer") : t("Supplier"),
      key: "party",
      width: 200,
      ellipsis: true,
      render: (_, r) => partyOf(r),
    },
    {
      title: t("OriginalInvoice"),
      key: "original",
      width: 130,
      align: "center",
      render: (_, r) =>
        r.returnOf ? (
          <Link href={`${INVOICE_BASE[side]}/${r.returnOf.id}`}>
            <bdi>{docNo(r.returnOf.type, r.returnOf.number)}</bdi>
          </Link>
        ) : (
          <bdi>{r.billingRef || "—"}</bdi>
        ),
    },
    ...(!isSale
      ? [
          {
            title: t("SupplierNoteNo"),
            key: "supNo",
            width: 120,
            align: "center",
            render: (_, r) => <bdi>{r.supplierInvoiceNo || "—"}</bdi>,
          },
        ]
      : []),
    {
      title: t("Reason"),
      key: "reason",
      width: 220,
      ellipsis: { showTitle: false },
      render: (_, r) => (
        <Tooltip title={r.noteReason}>
          <span>{r.noteReason}</span>
        </Tooltip>
      ),
    },
    {
      title: t("Total"),
      key: "total",
      width: 120,
      align: "end",
      render: (_, r) => <b>{money(r.totalAmount)}</b>,
    },
    ...(isSale
      ? [
          {
            title: tZ("Title"),
            key: "zatca",
            width: 110,
            align: "center",
            render: (_, r) =>
              r.zatcaDocument ? (
                <Tag color={ZATCA_COLOR[r.zatcaDocument.status]}>
                  {tZ(`docStatus.${r.zatcaDocument.status}`)}
                </Tag>
              ) : (
                "—"
              ),
          },
        ]
      : []),
    {
      title: t("User"),
      key: "user",
      width: 140,
      ellipsis: true,
      render: (_, r) =>
        locale === "ar" ? r.createdBy?.arFullname : r.createdBy?.enFullname,
    },
    {
      title: tTable("Actions"),
      key: "actions",
      width: 70,
      align: "center",
      render: (_, r) => (
        <Link href={`${base}/${r.id}`}>
          <Button
            aria-label={tButtons("View")}
            title={tButtons("View")}
            size="small"
            icon={<EyeOutlined />}
          />
        </Link>
      ),
    },
  ];
  const TABLE_WIDTH = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div className="pur">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{t(`list.${side}`)}</h1>
        {canCreate && (
          <Space wrap>
            <Link href={`${base}/new?type=credit`}>
              <Button
                type="primary"
                size="large"
                icon={<MinusCircleOutlined />}
              >
                {t("new.credit")}
              </Button>
            </Link>
            <Link href={`${base}/new?type=debit`}>
              <Button size="large" icon={<PlusCircleOutlined />}>
                {t("new.debit")}
              </Button>
            </Link>
          </Space>
        )}
      </div>

      <div className="cp-filters mb-3">
        <Space wrap align="start">
          <Segmented
            value={type ?? "all"}
            onChange={(v) => go({ type: v === "all" ? null : v, q, page: 1 })}
            options={[
              { value: "all", label: t("All") },
              { value: "credit", label: t("type.credit") },
              { value: "debit", label: t("type.debit") },
            ]}
          />
          <SearchBox
            width={380}
            placeholder={t(`ListSearch.${side}`)}
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
              placeholder={t("AllBranches")}
              value={branchId ?? undefined}
              onChange={(v) => go({ q, page: 1, branch: v ?? null })}
              options={branches.map((b) => ({
                value: b.id,
                label: locale === "ar" ? b.arName : b.enName,
              }))}
            />
          )}
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
