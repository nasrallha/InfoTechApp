"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Popconfirm,
  Space,
  Table,
  Tag,
} from "antd";
import {
  ArrowRightOutlined,
  CloseCircleOutlined,
  EditOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import { cancelAdjustmentAction } from "@/actions/inventory.actions";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PrintDocument from "@/components/printing/PrintDocument";
import StockDocument from "./StockDocument";
import { ADJUSTMENT_COLORS } from "./AdjustmentsList";
import { listSep } from "@/lib/list-sep";
import { C } from "@/lib/theme";
import "@/components/common/status-colors.css";
import "@/components/common/table.css";

const q3 = (v) => (v == null ? "" : Number(Number(v).toFixed(3)));

// ============================================================
// عرض مستند تالف / زيادة (طباعة + إلغاء)
// ============================================================
export default function AdjustmentDetails({
  adjustment: a,
  company,
  canCancel,
  canCreate,
  canEdit,
}) {
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Adjustments");
  const tI = useTranslations("Inventory");
  const tAlerts = useTranslations("Alerts");
  const { amount: money } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const userName = (u) =>
    u ? (locale === "ar" ? u.arFullname : u.enFullname) : "";
  const no = formatDocNo("adjustment", a.number);
  const cancelled = a.status === "cancelled";
  const color = cancelled
    ? ADJUSTMENT_COLORS.cancelled
    : ADJUSTMENT_COLORS[a.type];
  const typeName = t(`Type_${a.type}`);

  const cancel = async () => {
    setBusy(true);
    const res = await cancelAdjustmentAction(a.id);
    setBusy(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("CancelledMsg", { number: no }));
  };

  const columns = [
    { title: "#", key: "i", width: 50, render: (_, __, i) => i + 1 },
    {
      title: tI("Item"),
      key: "item",
      width: 230,
      render: (_, it) => (
        <div>
          <div style={{ fontWeight: 600 }}>{nameOf(it)}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            <bdi>{it.code}</bdi>
          </div>
          {/* الأرقام التسلسلية: التالفة / اللي دخلت بالزيادة */}
          {[...it.damagedSerials, ...it.surplusSerials].length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {[...it.damagedSerials, ...it.surplusSerials].map((s) => (
                <Tag key={s.id} color={color}>
                  <bdi>
                    {s.serial2 ? `${s.serial} / ${s.serial2}` : s.serial}
                  </bdi>
                </Tag>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      title: tI("Unit"),
      key: "unit",
      width: 100,
      render: (_, it) => nameOf(it.unit),
    },
    { title: tI("Qty"), key: "qty", width: 90, render: (_, it) => q3(it.qty) },
    {
      title: t("Reason"),
      key: "reason",
      width: 240,
      render: (_, it) => it.reason || "—",
    },
    {
      title: t("Cost"),
      key: "cost",
      width: 110,
      align: "end",
      render: (_, it) => money(it.cost),
    },
    {
      title: t("Value"),
      key: "value",
      width: 120,
      align: "end",
      render: (_, it) => <b>{money(it.value)}</b>,
    },
  ];
  const width = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          {typeName} <bdi>{no}</bdi>{" "}
          <Tag color={color}>{cancelled ? t("Cancelled") : t("Posted")}</Tag>
        </h1>
        <Space wrap>
          {!cancelled && canEdit && (
            <Link href={`/inventory/adjustments/${a.id}/edit`}>
              <Button type="primary" size="large" icon={<EditOutlined />}>
                {t("Edit")}
              </Button>
            </Link>
          )}
          {!cancelled && canCancel && (
            <Popconfirm
              title={
                a.type === "damage"
                  ? t("ConfirmCancelDamage")
                  : t("ConfirmCancelSurplus")
              }
              onConfirm={cancel}
            >
              <Button
                danger
                size="large"
                icon={<CloseCircleOutlined />}
                loading={busy}
              >
                {t("Cancel")}
              </Button>
            </Popconfirm>
          )}
          <Button
            size="large"
            icon={<PrinterOutlined />}
            onClick={() => setPrinting(true)}
          >
            {tI("Print")}
          </Button>
          {canCreate && (
            <Link href={`/inventory/adjustments/new?type=${a.type}`}>
              <Button size="large">
                {a.type === "damage" ? t("NewDamage") : t("NewSurplus")}
              </Button>
            </Link>
          )}
          <Button
            size="large"
            icon={<ArrowRightOutlined />}
            onClick={() => router.push("/inventory/adjustments")}
          >
            {tI("BackToList")}
          </Button>
        </Space>
      </div>

      {cancelled && (
        <Alert
          type="warning"
          showIcon
          className="mb-3"
          title={t("CancelledNote")}
        />
      )}

      {/* رأس ملوّن بنوع المستند وقيمته */}
      <div className="sc-hero mb-3" style={{ "--c": color }}>
        <Descriptions
          size="small"
          column={{ xs: 1, md: 3 }}
          items={[
            {
              key: "type",
              label: t("Type"),
              children: <b style={{ color }}>{typeName}</b>,
            },
            {
              key: "wh",
              label: tI("Warehouse"),
              children: nameOf(a.warehouse),
            },
            {
              key: "date",
              label: tI("Date"),
              children: <bdi>{formatDateTime(a.date)}</bdi>,
            },
            {
              key: "by",
              label: t("CreatedBy"),
              children: userName(a.createdBy),
            },
            {
              key: "total",
              label: t("TotalValue"),
              children: <b style={{ color, fontSize: 16 }}>{money(a.total)}</b>,
            },
            a.notes && { key: "notes", label: tI("Notes"), children: a.notes },
          ].filter(Boolean)}
        />
      </div>

      <Card size="small">
        <Table
          bordered
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={a.items}
          tableLayout="fixed"
          scroll={{ x: width }}
          pagination={false}
        />
      </Card>

      {printing && (
        <PrintDocument paperSize="A4" onDone={() => setPrinting(false)}>
          <StockDocument
            company={company}
            dir={locale === "ar" ? "rtl" : "ltr"}
            title={`${typeName} ${no}`}
            meta={[
              { label: tI("Warehouse"), value: nameOf(a.warehouse) },
              {
                label: tI("Date"),
                value: <bdi>{formatDateTime(a.date)}</bdi>,
              },
              {
                label: tI("Status"),
                value: cancelled ? t("Cancelled") : t("Posted"),
              },
              { label: t("TotalValue"), value: money(a.total) },
              { label: tI("Notes"), value: a.notes },
            ]}
            columns={[
              { title: "#", render: (_, i) => i + 1 },
              { title: tI("Code"), render: (it) => <bdi>{it.code}</bdi> },
              {
                title: tI("Item"),
                name: true,
                render: (it) => {
                  const serials = [...it.damagedSerials, ...it.surplusSerials];
                  return (
                    <>
                      {nameOf(it)}
                      {serials.length > 0 && (
                        <div style={{ fontSize: "8pt" }}>
                          <bdi>{serials.map((s) => s.serial).join(listSep(locale))}</bdi>
                        </div>
                      )}
                    </>
                  );
                },
              },
              { title: tI("Unit"), render: (it) => nameOf(it.unit) },
              { title: tI("Qty"), render: (it) => q3(it.qty) },
              { title: t("Reason"), render: (it) => it.reason || "" },
              { title: t("Value"), render: (it) => money(it.value) },
            ]}
            rows={a.items}
            signatures={[t("PreparedBy"), t("StoreKeeper"), t("ApprovedBy")]}
          />
        </PrintDocument>
      )}
    </div>
  );
}
