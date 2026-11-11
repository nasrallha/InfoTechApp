"use client";

import { useState } from "react";
import { qtyText } from "@/lib/unit-qty";
import { Button, Card, Col, Popconfirm, Row, Space, Table, Tag } from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  FileDoneOutlined,
  PlusOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { formatDateTime, formatDay, today } from "@/lib/dates";
import { formatDocNo, saleDocNo } from "@/lib/doc-number";
import { deleteQuotationAction } from "@/actions/quotation.actions";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PrintActions from "@/components/printing/PrintActions";
import InvoiceA4 from "@/components/printing/invoice/InvoiceA4";
import TotalsSummary from "@/components/purchases/TotalsSummary";
import SaleDocument from "./SaleDocument";
import { LineNoteText } from "@/components/purchases/LineNote";
import { C } from "@/lib/theme";
import "@/components/purchases/purchases.css";

// ============================================================
// عرض سعر: البيانات، الأصناف، الطباعة، والتحويل لفاتورة بيع
// ============================================================
export default function QuotationDetails({
  quotation,
  company,
  printSettings,
  canCreate,
  canUpdate,
  canDelete,
  canConvert,
  autoPrint,
}) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Sales");
  const tP = useTranslations("Purchases");
  const tAlerts = useTranslations("Alerts");
  const { amount: money } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const open = quotation.status === "open";
  const expired = open && quotation.validUntil < today();

  const remove = async () => {
    setDeleting(true);
    const res = await deleteQuotationAction(quotation.id);
    if (!res.success) {
      setDeleting(false);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("QuotationDeleted"));
    router.replace("/invoices/quotations");
    router.refresh();
  };

  const columns = [
    {
      title: "#",
      key: "i",
      width: 45,
      align: "center",
      render: (_, __, i) => i + 1,
    },
    {
      title: tP("Item"),
      key: "name",
      width: 230,
      render: (_, l) => (
        <div>
          <div className="pur-line__name">{nameOf(l)}</div>
          <div className="pur-line__code">
            <bdi>{l.code}</bdi>
          </div>
          <LineNoteText note={l.note} />
        </div>
      ),
    },
    {
      title: tP("Unit"),
      key: "unit",
      width: 100,
      render: (_, l) => nameOf(l.unit),
    },
    {
      title: tP("Qty"),
      key: "qty",
      width: 80,
      align: "center",
      render: (_, l) => qtyText(l.qty),
    },
    {
      title: t("Price"),
      key: "price",
      width: 110,
      align: "end",
      render: (_, l) => (
        <div>
          {money(l.price)}
          <div className="pur-line__code">
            {l.priceIncludesTax ? t("InclTax") : t("ExclTax")}
          </div>
        </div>
      ),
    },
    {
      title: tP("Discount"),
      key: "disc",
      width: 100,
      align: "end",
      render: (_, l) => money(l.itemDiscount + l.invoiceDiscount),
    },
    {
      title: tP("TaxRate"),
      key: "rate",
      width: 70,
      align: "center",
      render: (_, l) => `${l.taxRate}%`,
    },
    {
      title: tP("Net"),
      key: "net",
      width: 100,
      align: "end",
      render: (_, l) => money(l.netAmount),
    },
    {
      title: tP("Tax"),
      key: "tax",
      width: 90,
      align: "end",
      render: (_, l) => money(l.taxAmount),
    },
    {
      title: tP("Total"),
      key: "total",
      width: 110,
      align: "end",
      render: (_, l) => <b>{money(l.totalAmount)}</b>,
    },
  ];
  const TABLE_WIDTH = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div className="pur">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          {t("QuotationNo")}{" "}
          <bdi>{formatDocNo("quotation", quotation.number, quotation.docCode)}</bdi>{" "}
          {quotation.status === "converted" ? (
            <Tag color="green">{t("Converted")}</Tag>
          ) : expired ? (
            <Tag color="red">{t("Expired")}</Tag>
          ) : (
            <Tag color="blue">{t("Open")}</Tag>
          )}
        </h1>
        <Space wrap>
          <PrintActions
            autoPrint={autoPrint}
            defaultPaper={"A4"}
            fileName={formatDocNo("quotation", quotation.number, quotation.docCode)}
            renderDoc={(paper) =>
              paper === "A4" ? (
                <InvoiceA4
                  kind="quotation"
                  doc={quotation}
                  company={company}
                  settings={printSettings}
                />
              ) : (
                <SaleDocument
                  settings={{ ...printSettings, paperSize: paper }}
                  company={company}
                  doc={quotation}
                  kind="quotation"
                />
              )
            }
          />
          {open && canConvert && (
            <Link href={`/invoices/sales/new?quotation=${quotation.id}`}>
              <Button
                icon={<FileDoneOutlined />}
                style={{ borderColor: C.success, color: C.success }}
              >
                {t("ConvertToSale")}
              </Button>
            </Link>
          )}
          {open && canUpdate && (
            <Link href={`/invoices/quotations/${quotation.id}/edit`}>
              <Button icon={<EditOutlined />}>{tP("Edit")}</Button>
            </Link>
          )}
          {open && canDelete && (
            <Popconfirm
              title={t("DeleteQuotationTitle")}
              okText={tP("DeleteConfirm")}
              okButtonProps={{ danger: true }}
              cancelText={tP("Cancel")}
              onConfirm={remove}
            >
              <Button danger icon={<DeleteOutlined />} loading={deleting}>
                {tP("Delete")}
              </Button>
            </Popconfirm>
          )}
          {canCreate && (
            <Link href="/invoices/quotations/new">
              <Button icon={<PlusOutlined />}>{t("NewQuotation")}</Button>
            </Link>
          )}
          <Link href="/invoices/quotations">
            <Button icon={<UnorderedListOutlined />}>
              {t("QuotationsList")}
            </Button>
          </Link>
        </Space>
      </div>

      <Card size="small" className="mb-3">
        <div className="pur-info">
          <div>
            <span>{t("Customer")}</span>
            <span>
              {(locale === "ar"
                ? quotation.customerArName
                : quotation.customerEnName) || t("CashCustomer")}
            </span>
          </div>
          {quotation.customerTaxNo && (
            <div>
              <span>{t("CustomerVat")}</span>
              <bdi>{quotation.customerTaxNo}</bdi>
            </div>
          )}
          <div>
            <span>{t("Date")}</span>
            <bdi>{formatDateTime(quotation.date)}</bdi>
          </div>
          <div>
            <span>{t("ValidUntil")}</span>
            <bdi className={expired ? "text-red-600" : undefined}>
              {formatDay(quotation.validUntil)}
            </bdi>
          </div>
          <div>
            <span>{tP("Branch")}</span>
            <span>{nameOf(quotation.branch)}</span>
          </div>
          <div>
            <span>{tP("CreatedBy")}</span>
            <span>
              {locale === "ar"
                ? quotation.createdBy?.arFullname
                : quotation.createdBy?.enFullname}
            </span>
          </div>
          {quotation.sale && (
            <div>
              <span>{t("ConvertedTo")}</span>
              <Link href={`/invoices/sales/${quotation.sale.id}`}>
                {saleDocNo("sale", quotation.sale.number, quotation.sale.docCode)}
              </Link>
            </div>
          )}
        </div>
        {quotation.notes && (
          <div className="mt-3" style={{ whiteSpace: "pre-wrap" }}>
            <span className="text-gray-500">{t("Notes")}: </span>
            {quotation.notes}
          </div>
        )}
      </Card>

      <Card size="small" className="mb-3">
        <Table
          size="small"
          bordered
          rowKey="id"
          columns={columns}
          dataSource={quotation.items}
          pagination={false}
          tableLayout="fixed"
          scroll={{ x: TABLE_WIDTH }}
        />
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={{ span: 10, offset: 14 }}>
          <Card size="small" title={tP("Totals")}>
            <TotalsSummary
              taxMode="exclusive"
              totals={{
                subtotal: quotation.subtotal,
                itemsDiscount: quotation.itemsDiscount,
                invoiceDiscount: quotation.invoiceDiscount,
                net: quotation.netAmount,
                tax: quotation.taxAmount,
                total: quotation.totalAmount,
              }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
