"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Col,
  Popconfirm,
  Row,
  Space,
  Table,
  Tag,
  Tooltip,
} from "antd";
import { message } from "@/components/common/feedback";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  RollbackOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { showActionError } from "@/components/common/actionError";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import {
  deletePurchaseAction,
  deletePurchaseReturnAction,
} from "@/actions/purchase.actions";
import { formatDateTime, formatDay } from "@/lib/dates";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PrintActions from "@/components/printing/PrintActions";
import InvoiceA4 from "@/components/printing/invoice/InvoiceA4";
import PurchaseDocument from "./PurchaseDocument";
import TotalsSummary from "./TotalsSummary";
import { LineNoteText } from "./LineNote";
import "./purchases.css";
import {
  formatDocNo,
  paymentStatus,
  PAYMENT_STATUS_COLOR,
} from "@/lib/doc-number";

// حالة الإرجاع لفاتورة شراء: لا يوجد / جزئي / كامل
export function returnStatus(items) {
  const returned = items.reduce((s, i) => s + (i.returnedQty ?? 0), 0);
  if (returned <= 0) return "none";
  return items.every((i) => i.returnedQty >= i.qty) ? "full" : "partial";
}

// ============================================================
// عرض فاتورة شراء أو مرتجع: البيانات، الأصناف، المدفوعات، الطباعة
// autoPrint: تُطبع فور الفتح (بعد "حفظ وطباعة")
// ============================================================
export default function PurchaseDetails({
  purchase,
  company,
  printSettings,
  canCreate,
  canReturn,
  canUpdate,
  canDelete,
  autoPrint,
}) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const t = useTranslations("Purchases");
  const tTax = useTranslations("TaxModes");
  const { amount: money } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const isReturn = purchase.type === "return";
  const hasReturns = !isReturn && (purchase.returns?.length ?? 0) > 0;

  // الحذف: فاتورة الشراء ← قائمة المشتريات، المرتجع ← فاتورته الأصلية
  const remove = async () => {
    setDeleting(true);
    const res = isReturn
      ? await deletePurchaseReturnAction(purchase.id)
      : await deletePurchaseAction(purchase.id);
    if (!res.success) {
      setDeleting(false);
      return showActionError(res, tAlerts, locale);
    }
    message.success(isReturn ? t("ReturnDeleted") : t("PurchaseDeleted"));
    router.replace(
      isReturn && purchase.returnOf
        ? `/invoices/purchases/${purchase.returnOf.id}`
        : listPath,
    );
    router.refresh();
  };
  const listPath = isReturn
    ? "/invoices/purchase-returns"
    : "/invoices/purchases";
  const status = isReturn ? null : returnStatus(purchase.items);
  const payStatus = paymentStatus(
    purchase.totalAmount,
    purchase.paidAmount + (purchase.settledAmount ?? 0),
  );

  const columns = [
    {
      title: "#",
      key: "i",
      width: 45,
      align: "center",
      render: (_, __, i) => i + 1,
    },
    {
      title: t("Item"),
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
      title: t("Unit"),
      key: "unit",
      width: 100,
      render: (_, l) => nameOf(l.unit),
    },
    {
      title: t("Qty"),
      dataIndex: "qty",
      key: "qty",
      width: 80,
      align: "center",
    },
    {
      title: t("Price"),
      key: "price",
      width: 100,
      align: "end",
      render: (_, l) => money(l.price),
    },
    {
      title: t("Discount"),
      key: "disc",
      width: 100,
      align: "end",
      render: (_, l) => money(l.itemDiscount + l.invoiceDiscount),
    },
    {
      title: t("TaxRate"),
      key: "rate",
      width: 70,
      align: "center",
      render: (_, l) => `${l.taxRate}%`,
    },
    {
      title: t("Net"),
      key: "net",
      width: 100,
      align: "end",
      render: (_, l) => money(l.netAmount),
    },
    {
      title: t("Tax"),
      key: "tax",
      width: 90,
      align: "end",
      render: (_, l) => money(l.taxAmount),
    },
    {
      title: t("Total"),
      key: "total",
      width: 110,
      align: "end",
      render: (_, l) => <b>{money(l.totalAmount)}</b>,
    },
    ...(!isReturn
      ? [
          {
            title: t("Returned"),
            key: "returned",
            width: 90,
            align: "center",
            render: (_, l) =>
              l.returnedQty > 0 ? (
                <Tag color={l.returnedQty >= l.qty ? "red" : "orange"}>
                  {l.returnedQty}
                </Tag>
              ) : (
                "—"
              ),
          },
        ]
      : []),
  ];
  const TABLE_WIDTH = columns.reduce((s, c) => s + c.width, 0);

  const totals = {
    subtotal: purchase.subtotal,
    itemsDiscount: purchase.itemsDiscount,
    invoiceDiscount: purchase.invoiceDiscount,
    net: purchase.netAmount,
    tax: purchase.taxAmount,
    total: purchase.totalAmount,
  };

  return (
    <div className="pur">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          {isReturn ? t("ReturnNo") : t("PurchaseNo")}{" "}
          <bdi>{formatDocNo(purchase.type, purchase.number)}</bdi>{" "}
          {!isReturn && (
            <Tag color={PAYMENT_STATUS_COLOR[payStatus]}>
              {t(`paymentStatus.${payStatus}`)}
            </Tag>
          )}
          {status === "partial" && (
            <Tag color="orange">{t("status.partial")}</Tag>
          )}
          {status === "full" && <Tag color="red">{t("status.full")}</Tag>}
        </h1>
        <Space wrap>
          <PrintActions
            autoPrint={autoPrint}
            defaultPaper={"A4"}
            fileName={formatDocNo(purchase.type, purchase.number)}
            renderDoc={(paper) =>
              paper === "A4" ? (
                <InvoiceA4
                  kind={isReturn ? "purchaseReturn" : "purchase"}
                  doc={purchase}
                  company={company}
                  settings={printSettings}
                />
              ) : (
                <PurchaseDocument
                  settings={{ ...printSettings, paperSize: paper }}
                  company={company}
                  purchase={purchase}
                />
              )
            }
          />
          {!isReturn && canReturn && status !== "full" && (
            <Link
              href={`/invoices/purchase-returns/new?purchase=${purchase.id}`}
            >
              <Button icon={<RollbackOutlined />}>{t("MakeReturn")}</Button>
            </Link>
          )}
          {canCreate && (
            <Link
              href={
                isReturn
                  ? "/invoices/purchase-returns/new"
                  : "/invoices/purchases/new"
              }
            >
              <Button icon={<PlusOutlined />}>
                {isReturn ? t("NewReturn") : t("NewPurchase")}
              </Button>
            </Link>
          )}
          {/* التعديل والحذف: ممنوعان لو على الفاتورة مرتجعات */}
          {!isReturn && canUpdate && (
            <Tooltip title={hasReturns ? t("CannotEditHasReturns") : null}>
              <Link
                href={`/invoices/purchases/${purchase.id}/edit`}
                aria-disabled={hasReturns}
                onClick={(e) => hasReturns && e.preventDefault()}
              >
                <Button icon={<EditOutlined />} disabled={hasReturns}>
                  {t("Edit")}
                </Button>
              </Link>
            </Tooltip>
          )}
          {canDelete && (
            <Popconfirm
              title={
                isReturn ? t("DeleteReturnTitle") : t("DeletePurchaseTitle")
              }
              description={
                isReturn ? t("DeleteReturnWarning") : t("DeletePurchaseWarning")
              }
              okText={t("DeleteConfirm")}
              okButtonProps={{ danger: true }}
              cancelText={t("Cancel")}
              onConfirm={remove}
              disabled={hasReturns}
            >
              <Tooltip title={hasReturns ? t("CannotDeleteHasReturns") : null}>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  loading={deleting}
                  disabled={hasReturns}
                >
                  {t("Delete")}
                </Button>
              </Tooltip>
            </Popconfirm>
          )}
          <Link href={listPath}>
            <Button icon={<UnorderedListOutlined />}>
              {isReturn ? t("ReturnsList") : t("PurchasesList")}
            </Button>
          </Link>
        </Space>
      </div>

      <Card size="small" className="mb-3">
        <div className="pur-info">
          <div>
            <span>{t("Supplier")}</span>
            <span>
              {locale === "ar"
                ? purchase.supplierArName
                : purchase.supplierEnName}
            </span>
          </div>
          {purchase.supplierTaxNo && (
            <div>
              <span>{t("SupplierVat")}</span>
              <bdi>{purchase.supplierTaxNo}</bdi>
            </div>
          )}
          {purchase.supplierInvoiceNo && (
            <div>
              <span>
                {isReturn ? t("SupplierNoteNo") : t("SupplierInvoiceNo")}
              </span>
              <bdi>{purchase.supplierInvoiceNo}</bdi>
            </div>
          )}
          {purchase.supplierInvoiceDate && (
            <div>
              <span>{t("SupplierInvoiceDate")}</span>
              <bdi>{formatDay(purchase.supplierInvoiceDate)}</bdi>
            </div>
          )}
          <div>
            <span>{t("EntryDate")}</span>
            <bdi>{formatDateTime(purchase.date)}</bdi>
          </div>
          <div>
            <span>{t("TaxMode")}</span>
            <span>{tTax(purchase.taxMode)}</span>
          </div>
          <div>
            <span>{t("Branch")}</span>
            <span>{nameOf(purchase.branch)}</span>
          </div>
          {purchase.warehouse && (
            <div>
              <span>{t("Warehouse")}</span>
              <span>{nameOf(purchase.warehouse)}</span>
            </div>
          )}
          <div>
            <span>{t("CreatedBy")}</span>
            <span>
              {locale === "ar"
                ? purchase.createdBy?.arFullname
                : purchase.createdBy?.enFullname}
            </span>
          </div>
          {isReturn && purchase.returnOf && (
            <div>
              <span>{t("OriginalInvoice")}</span>
              <Link href={`/invoices/purchases/${purchase.returnOf.id}`}>
                {formatDocNo("purchase", purchase.returnOf.number)}
              </Link>
            </div>
          )}
        </div>
        {purchase.notes && (
          <div className="mt-3">
            <span className="text-gray-500">{t("Notes")}: </span>
            {purchase.notes}
          </div>
        )}
      </Card>

      <Card size="small" className="mb-3">
        <Table
          size="small"
          bordered
          rowKey="id"
          columns={columns}
          dataSource={purchase.items}
          pagination={false}
          tableLayout="fixed"
          scroll={{ x: TABLE_WIDTH }}
        />
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card size="small" title={t("Payments")} className="h-full">
            {purchase.payments.length === 0 && (
              <p className="text-gray-500">{t("NoPayments")}</p>
            )}
            {purchase.payments.map((p) => (
              <div key={p.id} className="pur-totals">
                <div>
                  <span>
                    {nameOf(p.paymentMethod)}
                    {p.reference && (
                      <span className="pur-line__code">
                        {" "}
                        (<bdi>{p.reference}</bdi>)
                      </span>
                    )}
                  </span>
                  <bdi>{money(p.amount)}</bdi>
                </div>
              </div>
            ))}
            <div className="pur-payments__summary mt-3">
              <div>
                <span>{t("Paid")}</span>
                <b>{money(purchase.paidAmount)}</b>
              </div>
              <div>
                <span>
                  {isReturn ? t("CreditFromSupplier") : t("CreditOnSupplier")}
                </span>
                <Tag
                  color={
                    purchase.remainingAmount - (purchase.settledAmount ?? 0) >
                    0.0001
                      ? "orange"
                      : "green"
                  }
                >
                  {money(
                    purchase.remainingAmount - (purchase.settledAmount ?? 0),
                  )}
                </Tag>
              </div>
            </div>

            {!isReturn && purchase.returns?.length > 0 && (
              <div className="mt-4">
                <b>{t("ReturnsOfInvoice")}</b>
                {purchase.returns.map((r) => (
                  <div key={r.id} className="pur-totals">
                    <div>
                      <Link href={`/invoices/purchase-returns/${r.id}`}>
                        {t("ReturnNo")} {formatDocNo("return", r.number)}
                      </Link>
                      <span>
                        <bdi>{formatDateTime(r.date)}</bdi> —{" "}
                        <bdi>{money(r.totalAmount)}</bdi>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title={t("Totals")} className="h-full">
            <TotalsSummary totals={totals} taxMode={purchase.taxMode} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
