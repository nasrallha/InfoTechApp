"use client";

import { useState } from "react";
import { Button, Input, Modal, Space, Table } from "antd";
import { EditOutlined, EyeOutlined, SearchOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { showActionError } from "@/components/common/actionError";
import { searchInvoicesAction } from "@/actions/invoice-search.actions";

// ============================================================
// زر «بحث عن فاتورة» جوه شاشة الإنشاء
// kind: sale | saleReturn | purchase | purchaseReturn
// النتايج بتظهر بس بعد البحث (برقم الفاتورة أو اسم العميل/المورد)، والبحث بـ Enter أو الزرار
// ============================================================
export default function InvoiceSearchButton({ kind }) {
  const t = useTranslations("InvoiceSearch");
  const tButtons = useTranslations("Buttons");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const purchase = kind === "purchase" || kind === "purchaseReturn";

  const run = async (text, p = 1) => {
    const query = text.trim();
    if (!query) return;
    setLoading(true);
    const res = await searchInvoicesAction({ kind, q: query, page: p });
    setLoading(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    setSearched(query);
    setPage(p);
    setData(res.data);
  };

  const nameOf = (r) => (locale === "ar" ? r.arName : r.enName || r.arName) || t("CashCustomer");

  const columns = [
    {
      title: t("DocNo"),
      key: "doc",
      width: 130,
      render: (_, r) => (
        <Link href={r.href}>
          <bdi>{r.docNo}</bdi>
        </Link>
      ),
    },
    { title: t("Date"), key: "date", width: 150, render: (_, r) => formatDateTime(r.date) },
    { title: purchase ? t("Supplier") : t("Customer"), key: "party", width: 200, ellipsis: true, render: (_, r) => nameOf(r) },
    { title: t("Total"), key: "total", width: 120, align: "end", render: (_, r) => money(r.total) },
    { title: t("Remaining"), key: "rem", width: 120, align: "end", render: (_, r) => (r.remaining ? money(r.remaining) : "") },
    {
      title: t("Actions"),
      key: "act",
      width: 90,
      align: "center",
      render: (_, r) => (
        <Space size={4}>
          <Link href={r.href}>
            <Button size="small" icon={<EyeOutlined />} aria-label={tButtons("View")} title={tButtons("View")} />
          </Link>
          {r.editHref && (
            <Link href={r.editHref}>
              <Button size="small" icon={<EditOutlined />} aria-label={tButtons("Edit")} title={tButtons("Edit")} />
            </Link>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Button size="large" icon={<SearchOutlined />} onClick={() => setOpen(true)}>
        {t("Button")}
      </Button>
      <Modal
        open={open}
        title={t(`Title_${kind}`)}
        width={900}
        footer={null}
        mask={{ closable: false }}
        onCancel={() => setOpen(false)}
        destroyOnHidden={false}
      >
        <Space.Compact style={{ width: "100%" }} className="mb-3">
          <Input
            autoFocus
            allowClear
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onPressEnter={() => run(q)}
            placeholder={purchase ? t("PlaceholderPurchase") : t("PlaceholderSale")}
          />
          <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={() => run(q)}>
            {tButtons("Search")}
          </Button>
        </Space.Compact>
        {data && (
          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={data.rows}
            loading={loading}
            scroll={{ x: 810 }}
            locale={{ emptyText: t("NoResults") }}
            pagination={{
              current: page,
              pageSize: 10,
              total: data.total,
              showSizeChanger: false,
              onChange: (p) => run(searched, p),
            }}
          />
        )}
      </Modal>
    </>
  );
}
