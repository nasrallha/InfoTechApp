"use client";

import { useState } from "react";
import { Button, Space, Table, Tag } from "antd";
import { EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import { useCurrency } from "@/components/common/CurrencyProvider";
import SearchBox from "@/components/common/SearchBox";
import { PARTY_TAG, VOUCHER_PATH } from "./voucherConfig";
import "@/components/common/table.css";

// ============================================================
// قائمة سندات القبض / الصرف / التسوية
// البحث: رقم السند أو اسم الطرف أو المرجع (?q=...&page=...)
// ============================================================
export default function VouchersList({ type, data, q, canCreate }) {
  const [search, setSearch] = useState(q ?? "");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Accounts");
  const tTable = useTranslations("Table");
  const tButtons = useTranslations("Buttons");
  const { amount: money } = useCurrency();
  const base = VOUCHER_PATH[type];
  const isSettlement = type === "settlement";

  const go = ({ q: qq, page }) => {
    const query = new URLSearchParams();
    if (qq) query.set("q", qq);
    if (page > 1) query.set("page", String(page));
    const qs = query.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const columns = [
    {
      title: t("VoucherNo"),
      key: "number",
      width: 110,
      align: "center",
      render: (_, r) => (
        <Link href={`/accounts/vouchers/${r.id}`}>
          <b>
            <bdi>{formatDocNo(type, r.number, r.docCode)}</bdi>
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
      title: t("PartyType"),
      key: "partyType",
      width: 120,
      align: "center",
      render: (_, r) => (
        <Tag color={PARTY_TAG[r.partyType]}>
          {t(`party.${type}.${r.partyType}`)}
        </Tag>
      ),
    },
    {
      title: t("Party"),
      key: "party",
      width: 220,
      ellipsis: true,
      render: (_, r) => (locale === "ar" ? r.partyArName : r.partyEnName),
    },
    {
      title: t("Amount"),
      key: "amount",
      width: 120,
      align: "end",
      render: (_, r) => <b>{money(r.amount)}</b>,
    },
    ...(isSettlement
      ? []
      : [
          {
            title: t("PaymentMethod"),
            key: "method",
            width: 130,
            align: "center",
            render: (_, r) =>
              r.paymentMethod &&
              (locale === "ar"
                ? r.paymentMethod.arName
                : r.paymentMethod.enName),
          },
        ]),
    {
      title: t("Notes"),
      key: "notes",
      width: 200,
      ellipsis: true,
      render: (_, r) => r.notes || r.reference,
    },
    {
      title: t("CreatedBy"),
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
        <Link href={`/accounts/vouchers/${r.id}`}>
          <Button aria-label={tButtons("View")} title={tButtons("View")} size="small" icon={<EyeOutlined />} />
        </Link>
      ),
    },
  ];
  const TABLE_WIDTH = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{t(`list.${type}`)}</h1>
        {canCreate && (
          <Link href={`${base}/new`}>
            <Button type="primary" size="large" icon={<PlusOutlined />}>
              {t(`new.${type}`)}
            </Button>
          </Link>
        )}
      </div>
      <Space wrap className="mb-3">
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
