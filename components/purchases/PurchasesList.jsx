"use client";

import { useState } from "react";
import { Button, Select, Space, Table, Tag } from "antd";
import { EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { formatDateTime, formatDay } from "@/lib/dates";
import { useCurrency } from "@/components/common/CurrencyProvider";
import "@/components/common/table.css";
import SearchBox from "@/components/common/SearchBox";
import DayPicker from "@/components/common/DayPicker";
import "./purchases.css";
import {
  formatDocNo,
  paymentStatus,
  PAYMENT_STATUS_COLOR,
} from "@/lib/doc-number";

// ============================================================
// قائمة فواتير الشراء أو المرتجعات
// البحث: رقمنا، رقم فاتورة المورد، اسم المورد (في الرابط ?q=...&page=...)
// ============================================================
// branches: للمدير فقط (عرض كل الفروع) ← فلتر بالفرع، branchId: الفرع المختار
export default function PurchasesList({
  type,
  data,
  q,
  canCreate,
  branches,
  branchId,
  range,
}) {
  const [search, setSearch] = useState(q ?? "");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Purchases");
  const tTable = useTranslations("Table");
  const tButtons = useTranslations("Buttons");
  const { amount: money } = useCurrency();

  const isReturn = type === "return";
  const basePath = isReturn
    ? "/invoices/purchase-returns"
    : "/invoices/purchases";

  // الفترة المحددة في الرابط (من غيرها الصفحة بتعرض النهارده)
  const explicitFrom = range?.explicit ? range.from : null;
  const explicitTo = range?.explicit ? range.to : null;

  const go = (params) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.page > 1) query.set("page", String(params.page));
    const branch = params.branch === undefined ? branchId : params.branch;
    if (branch) query.set("branch", String(branch));
    // الفترة: اللي المستخدم حددها بس (من غيرها ← النهارده، أو كل التواريخ مع البحث)
    const from = params.from === undefined ? explicitFrom : params.from;
    const to = params.to === undefined ? explicitTo : params.to;
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const qs = query.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const columns = [
    {
      title: isReturn ? t("ReturnNo") : t("PurchaseNo"),
      dataIndex: "number",
      key: "number",
      width: 110,
      align: "center",
      render: (v, r) => (
        <Link href={`${basePath}/${r.id}`}>
          <b>{formatDocNo(type, v, r.docCode)}</b>
        </Link>
      ),
    },
    {
      title: t("EntryDate"),
      key: "date",
      width: 150,
      align: "center",
      render: (_, r) => <bdi>{formatDateTime(r.date)}</bdi>,
    },
    {
      title: t("Supplier"),
      key: "supplier",
      width: 220,
      ellipsis: true,
      render: (_, r) => (locale === "ar" ? r.supplierArName : r.supplierEnName),
    },
    isReturn
      ? {
          title: t("OriginalInvoice"),
          key: "original",
          width: 120,
          align: "center",
          render: (_, r) =>
            r.returnOf && (
              <Link href={`/invoices/purchases/${r.returnOf.id}`}>
                {formatDocNo("purchase", r.returnOf.number, r.returnOf.docCode)}
              </Link>
            ),
        }
      : {
          title: t("SupplierInvoiceNo"),
          key: "supplierInvoiceNo",
          width: 160,
          render: (_, r) => (
            <div>
              <bdi>{r.supplierInvoiceNo}</bdi>
              <div className="pur-line__code">
                <bdi>{formatDay(r.supplierInvoiceDate)}</bdi>
              </div>
            </div>
          ),
        },
    {
      title: t("Total"),
      key: "total",
      width: 120,
      align: "end",
      render: (_, r) => <b>{money(r.totalAmount)}</b>,
    },
    {
      title: t("Paid"),
      key: "paid",
      width: 110,
      align: "end",
      render: (_, r) => money(r.paidAmount),
    },
    ...(!isReturn
      ? [
          {
            title: t("PaymentStatusTitle"),
            key: "payStatus",
            width: 120,
            align: "center",
            render: (_, r) => {
              // مستخلص المقاول الآخر: المطلوب = الإجمالي - حجز الضمان
              const st = paymentStatus(
                r.totalAmount - (r.retention ?? 0),
                r.paidAmount + (r.settledAmount ?? 0),
              );
              return (
                <Tag color={PAYMENT_STATUS_COLOR[st]}>
                  {t(`paymentStatus.${st}`)}
                </Tag>
              );
            },
          },
        ]
      : []),
    {
      title: t("Credit"),
      key: "remaining",
      width: 110,
      align: "center",
      render: (_, r) =>
        r.remainingAmount - (r.settledAmount ?? 0) > 0.0001 ? (
          <Tag color="orange">
            {money(r.remainingAmount - (r.settledAmount ?? 0))}
          </Tag>
        ) : (
          <Tag color="green">{t("FullyPaid")}</Tag>
        ),
    },
    ...(!isReturn
      ? [
          {
            title: t("Returns"),
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
    {
      title: tTable("Actions"),
      key: "actions",
      width: 90,
      align: "center",
      render: (_, r) => (
        <Link href={`${basePath}/${r.id}`}>
          <Button aria-label={tButtons("View")} title={tButtons("View")} size="small" icon={<EyeOutlined />} />
        </Link>
      ),
    },
  ];
  const TABLE_WIDTH = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div className="pur">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          {isReturn ? t("ReturnsList") : t("PurchasesList")}
        </h1>
        {canCreate && (
          <Link href={`${basePath}/new`}>
            <Button type="primary" size="large" icon={<PlusOutlined />}>
              {isReturn ? t("NewReturn") : t("NewPurchase")}
            </Button>
          </Link>
        )}
      </div>

      <Space wrap className="mb-3" align="start">
        <SearchBox
          width={460}
          placeholder={t("ListSearch")}
          value={search}
          onChange={(v) => {
            setSearch(v);
            // مسح البحث بالـ X يرجع كل الفواتير
            if (!v && q) go({ q: "", page: 1 });
          }}
          onSearch={(v) => go({ q: v.trim(), page: 1 })}
        />
        {/* الفترة: من / إلى (الافتراضي فواتير النهارده) */}
        <DayPicker
          allowClear
          style={{ width: 160 }}
          placeholder={t("RangeFrom")}
          value={range?.from ?? undefined}
          max={range?.to ?? undefined}
          onChange={(v) => go({ q, page: 1, from: v ?? null, to: range?.to ?? null })}
        />
        <DayPicker
          allowClear
          style={{ width: 160 }}
          placeholder={t("RangeTo")}
          value={range?.to ?? undefined}
          min={range?.from ?? undefined}
          onChange={(v) => go({ q, page: 1, from: range?.from ?? null, to: v ?? null })}
        />
        {/* المدير: فلتر بالفرع (فاضي = كل الفروع) */}
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
