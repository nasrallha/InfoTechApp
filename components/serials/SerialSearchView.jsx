"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Space,
  Spin,
  Table,
  Tag,
} from "antd";
import {
  NumberOutlined,
  PrinterOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PageHeader from "@/components/common/PageHeader";
import { showActionError } from "@/components/common/actionError";
import PrintDocument from "@/components/printing/PrintDocument";
import WarrantyCertificate from "./WarrantyCertificate";
import { Link } from "@/i18n/routing";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatDocNo, saleDocNo } from "@/lib/doc-number";
import {
  getSerialCardAction,
  searchSerialsAction,
} from "@/actions/serial.actions";
import WarrantyBadge, { SerialStatusTag } from "./WarrantyBadge";
import { C } from "@/lib/theme";

// ============================================================
// البحث بالرقم التسلسلي: العميل جه بالجهاز من غير فاتورة
// تكتب الرقم (أو جزء منه) ← كارت القطعة: الصنف، البيع، العميل، الضمان، وتاريخها
// ============================================================
// receiptPaper: ورق الكاشير من إعدادات طباعة الفواتير ("80mm" / "58mm")
export default function SerialSearchView({
  initialQuery = "",
  receiptPaper = "80mm",
}) {
  const t = useTranslations("Serials");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState(null);
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(false);

  const open = async (id) => {
    setLoading(true);
    const res = await getSerialCardAction(id);
    setLoading(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    setCard(res.data);
  };

  const search = async (value) => {
    const text = (value ?? q).trim();
    if (text.length < 2) return;
    setLoading(true);
    setCard(null);
    const res = await searchSerialsAction(text);
    setLoading(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    setResults(res.data);
    // نتيجة واحدة أو رقم مطابق تمامًا ← الكارت على طول
    const exact = res.data.filter(
      (r) =>
        r.serial.toLowerCase() === text.toLowerCase() ||
        (r.serial2 ?? "").toLowerCase() === text.toLowerCase(),
    );
    if (res.data.length === 1) open(res.data[0].id);
    else if (exact.length === 1) open(exact[0].id);
  };

  return (
    <>
      <PageHeader title={t("SearchTitle")} subtitle={t("SearchSubtitle")} />
      {/* الخانة والزرار بنفس الارتفاع */}
      <Space.Compact className="mb-4" style={{ width: "100%", maxWidth: 640 }}>
        <Input
          size="large"
          autoFocus
          allowClear
          prefix={<NumberOutlined style={{ fontSize: 18, color: C.muted }} />}
          placeholder={t("SearchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onPressEnter={() => search()}
        />
        <Button
          size="large"
          type="primary"
          icon={<SearchOutlined />}
          loading={loading}
          onClick={() => search()}
        >
          {t("Search")}
        </Button>
      </Space.Compact>

      {results && !results.length && (
        <Empty description={t("NotFound", { q: q.trim() })} />
      )}

      {results?.length > 1 && !card && (
        <Table
          size="small"
          rowKey="id"
          dataSource={results}
          pagination={false}
          scroll={{ x: 760 }}
          onRow={(r) => ({
            onClick: () => open(r.id),
            style: { cursor: "pointer" },
          })}
          columns={[
            {
              title: t("DefaultLabel1"),
              render: (_, r) => (
                <bdi>{r.serial2 ? `${r.serial} / ${r.serial2}` : r.serial}</bdi>
              ),
            },
            {
              title: t("Product"),
              render: (_, r) => (
                <span>
                  {nm(r.product)}{" "}
                  <bdi style={{ color: C.muted }}>{r.product.code}</bdi>
                </span>
              ),
            },
            {
              title: t("Status"),
              width: 120,
              render: (_, r) => <SerialStatusTag status={r.status} />,
            },
            {
              title: t("Customer"),
              render: (_, r) => nm(r.customer) || "—",
            },
            {
              title: t("Warranty"),
              width: 190,
              render: (_, r) =>
                r.status === "sold" ? (
                  <WarrantyBadge endsAt={r.warrantyEndsAt} />
                ) : (
                  "—"
                ),
            },
          ]}
        />
      )}

      {results?.length > 1 && card && (
        <Button type="link" className="mb-2 p-0" onClick={() => setCard(null)}>
          {t("BackToResults", { n: results.length })}
        </Button>
      )}

      {loading && !results && <Spin />}
      {card && <SerialCard card={card} receiptPaper={receiptPaper} />}
    </>
  );
}

// ---------- كارت القطعة ----------
function SerialCard({ card, receiptPaper }) {
  const t = useTranslations("Serials");
  const tExports = useTranslations("Exports");
  const locale = useLocale();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [printing, setPrinting] = useState(false);
  const label1 = card.product.serialLabel1 || t("DefaultLabel1");
  const label2 = card.product.serialLabel2 || t("DefaultLabel2");
  const sale = card.sale;
  const customerName =
    nm(card.customer) ||
    (sale
      ? nm({ arName: sale.customerArName, enName: sale.customerEnName })
      : "") ||
    t("CashCustomer");

  // شهادة الضمان (A4)
  const certificate = {
    title: t("Certificate"),
    info: [
      [t("Product"), `${nm(card.product)} (${card.product.code})`],
      [label1, card.serial],
      ...(card.serial2 ? [[label2, card.serial2]] : []),
      ...(card.isUsed ? [[t("Used"), "✓"]] : []),
      [t("Customer"), customerName],
      ...(card.customer?.phone ? [[t("Phone"), card.customer.phone]] : []),
      ...(sale
        ? [
            [t("Invoice"), saleDocNo(sale.type, sale.number, sale.docCode)],
            [t("SoldAt"), formatDate(sale.date)],
          ]
        : []),
      [
        t("Warranty"),
        card.warrantyMonths > 0
          ? `${t("MonthsN", { n: card.warrantyMonths })} — ${t(`WarrantyType_${card.warrantyType ?? "store"}`)}`
          : t("NoWarranty"),
      ],
      ...(card.warrantyEndsAt
        ? [[t("WarrantyEnds"), card.warrantyEndsAt]]
        : []),
    ],
    signatures: [t("SignSeller"), t("SignCustomer")],
  };

  return (
    <Card
      size="small"
      title={
        <Space wrap>
          <NumberOutlined />
          <bdi>
            {card.serial2 ? `${card.serial} / ${card.serial2}` : card.serial}
          </bdi>
          <SerialStatusTag status={card.status} />
          {card.isUsed && <Tag color="purple">{t("Used")}</Tag>}
          {card.status === "sold" && (
            <WarrantyBadge endsAt={card.warrantyEndsAt} />
          )}
        </Space>
      }
      extra={
        card.status === "sold" && (
          <Space wrap>
            <Button
              icon={<PrinterOutlined />}
              onClick={() => setPrinting("A4")}
            >
              {t("PrintCertificateA4")}
            </Button>
            <Button
              icon={<PrinterOutlined />}
              onClick={() => setPrinting(receiptPaper)}
            >
              {t("PrintCertificateReceipt")}
            </Button>
          </Space>
        )
      }
    >
      {card.status !== "sold" && (
        <Alert
          type="info"
          showIcon
          className="mb-3"
          title={t(`StatusHint_${card.status}`)}
        />
      )}
      <Descriptions
        size="small"
        bordered
        column={{ xs: 1, sm: 2, lg: 3 }}
        items={[
          {
            key: "p",
            label: t("Product"),
            children: (
              <span>
                <b>{nm(card.product)}</b>{" "}
                <bdi style={{ color: C.muted }}>{card.product.code}</bdi>
              </span>
            ),
          },
          { key: "s1", label: label1, children: <bdi>{card.serial}</bdi> },
          ...(card.serial2
            ? [
                {
                  key: "s2",
                  label: label2,
                  children: <bdi>{card.serial2}</bdi>,
                },
              ]
            : []),
          ...(sale
            ? [
                {
                  key: "inv",
                  label: t("Invoice"),
                  children: (
                    <Link href={`/invoices/sales/${sale.id}`}>
                      <bdi>{saleDocNo(sale.type, sale.number, sale.docCode)}</bdi>
                    </Link>
                  ),
                },
                {
                  key: "date",
                  label: t("SoldAt"),
                  children: <bdi>{formatDateTime(sale.date)}</bdi>,
                },
                { key: "br", label: t("Branch"), children: nm(sale.branch) },
                {
                  key: "by",
                  label: t("SoldBy"),
                  children:
                    locale === "ar"
                      ? sale.createdBy?.arFullname
                      : sale.createdBy?.enFullname,
                },
                { key: "c", label: t("Customer"), children: customerName },
                ...(card.customer?.phone
                  ? [
                      {
                        key: "ph",
                        label: t("Phone"),
                        children: <bdi>{card.customer.phone}</bdi>,
                      },
                    ]
                  : []),
                {
                  key: "w",
                  label: t("Warranty"),
                  children:
                    card.warrantyMonths > 0
                      ? `${t("MonthsN", { n: card.warrantyMonths })} — ${t(`WarrantyType_${card.warrantyType ?? "store"}`)}`
                      : t("NoWarranty"),
                },
                ...(card.warrantyEndsAt
                  ? [
                      {
                        key: "we",
                        label: t("WarrantyEnds"),
                        children: <bdi>{card.warrantyEndsAt}</bdi>,
                      },
                    ]
                  : []),
              ]
            : []),
          ...(card.purchase
            ? [
                {
                  key: "pur",
                  label: t("Purchase"),
                  children: (
                    <span>
                      <Link href={`/invoices/purchases/${card.purchase.id}`}>
                        <bdi>
                          {formatDocNo("purchase", card.purchase.number, card.purchase.docCode)}
                        </bdi>
                      </Link>{" "}
                      —{" "}
                      {nm({
                        arName: card.purchase.supplierArName,
                        enName: card.purchase.supplierEnName,
                      })}{" "}
                      (<bdi>{formatDate(card.purchase.date)}</bdi>)
                    </span>
                  ),
                },
              ]
            : []),
          // التالف: رقم المستند والسبب والتاريخ
          ...(card.damage && card.status === "damaged"
            ? [
                {
                  key: "dmg",
                  label: t("DamagedBy"),
                  children: (
                    <span>
                      <Link href={`/inventory/adjustments/${card.damage.id}`}>
                        <bdi>
                          {formatDocNo("adjustment", card.damage.number, card.damage.docCode)}
                        </bdi>
                      </Link>{" "}
                      (<bdi>{formatDate(card.damage.date)}</bdi>)
                      {card.damage.reason && <> — {card.damage.reason}</>}
                    </span>
                  ),
                },
              ]
            : []),
          ...(card.surplus
            ? [
                {
                  key: "sur",
                  label: t("AddedBySurplus"),
                  children: (
                    <Link href={`/inventory/adjustments/${card.surplus.id}`}>
                      <bdi>
                        {formatDocNo("adjustment", card.surplus.number, card.surplus.docCode)}
                      </bdi>
                    </Link>
                  ),
                },
              ]
            : []),
          ...(card.purchaseReturn
            ? [
                {
                  key: "pret",
                  label: t("ReturnedToSupplier"),
                  children: (
                    <Link
                      href={`/invoices/purchase-returns/${card.purchaseReturn.id}`}
                    >
                      <bdi>
                        {formatDocNo("return", card.purchaseReturn.number, card.purchaseReturn.docCode)}
                      </bdi>
                    </Link>
                  ),
                },
              ]
            : []),
        ]}
      />

      {card.history.length > 0 && (
        <>
          <h4 className="font-bold mt-4 mb-3">{t("History")}</h4>
          <ol style={{ margin: 0, paddingInlineStart: 20 }}>
            {card.history.map((h) => {
              const who = nm({
                arName: h.customerArName,
                enName: h.customerEnName,
              });
              return (
                <li
                  key={`${h.type}-${h.id}`}
                  style={{
                    marginBottom: 6,
                    color: h.type === "return" ? C.warningText : undefined,
                  }}
                >
                  {t(h.type === "return" ? "HistoryReturn" : "HistorySale")}{" "}
                  <Link
                    href={`/invoices/${h.type === "return" ? "sales-returns" : "sales"}/${h.id}`}
                  >
                    <bdi>{saleDocNo(h.type, h.number, h.docCode)}</bdi>
                  </Link>{" "}
                  — <bdi>{formatDate(h.date)}</bdi>
                  {who ? ` — ${who}` : ""}
                </li>
              );
            })}
          </ol>
        </>
      )}

      {printing && (
        <PrintDocument
          paperSize={printing}
          margin={printing === "A4" ? 10 : 0}
          onDone={() => setPrinting(false)}
        >
          <WarrantyCertificate
            paper={printing}
            title={certificate.title}
            rows={certificate.info}
            signatures={certificate.signatures}
            labels={{
              taxNo: t("TaxNo"),
              phone: t("Phone"),
              printedAt: tExports("PrintedAt"),
            }}
          />
        </PrintDocument>
      )}
    </Card>
  );
}
