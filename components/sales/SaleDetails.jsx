"use client";

import { useState } from "react";
import { qtyText } from "@/lib/unit-qty";
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
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  RollbackOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { dbDateToDay, formatDateTime, formatDay } from "@/lib/dates";
import {
  formatDocNo,
  paymentStatus,
  PAYMENT_STATUS_COLOR,
  saleDocNo,
} from "@/lib/doc-number";
import {
  deleteSaleAction,
  deleteSaleReturnAction,
} from "@/actions/sale.actions";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PrintActions from "@/components/printing/PrintActions";
import InvoiceA4 from "@/components/printing/invoice/InvoiceA4";
import ZatcaStatusBox from "@/components/zatca/ZatcaStatusBox";
import TotalsSummary from "@/components/purchases/TotalsSummary";
import { returnStatus } from "@/components/purchases/PurchaseDetails";
import SaleDocument from "./SaleDocument";
import { LineNoteText } from "@/components/purchases/LineNote";
import "@/components/purchases/purchases.css";
import SerialPrintLines from "@/components/serials/SerialPrintLines";
import OilStickerButton from "@/components/vehicles/OilSticker";

// ============================================================
// عرض فاتورة بيع أو مرتجع مبيعات: البيانات، الأصناف، المدفوعات، الطباعة
// ============================================================
export default function SaleDetails({
  sale,
  company,
  printSettings,
  canCreate,
  canReturn,
  canUpdate,
  canDelete,
  productionLive = false,
  autoPrint,
  zatcaActive = false,
  // ميزة الزكاة في باقة الشركة (وضع الشركات)؛ غير كده دايماً true
  zatcaEnabled = true,
  canZatcaSend = false,
  canZatcaExport = false,
}) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Sales");
  const tP = useTranslations("Purchases");
  const tAlerts = useTranslations("Alerts");
  const { amount: money } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const isReturn = sale.type === "return";
  const hasReturns = !isReturn && sale.returns.length > 0;
  const shiftClosed = sale.shift && sale.shift.status !== "open";
  // اتوقّعت للزكاة: مقفولة (التصحيح بمرتجع / إشعار دائن)
  const zdoc = sale.zatcaDocument;
  const zatcaLocked = Boolean(zdoc);
  // الضريبية قبل اعتماد الهيئة: متطبعش تلقائياً
  const notCleared = zdoc?.kind === "standard" && zdoc.status !== "cleared";
  const tZ = useTranslations("Zatca");
  const locked = hasReturns || shiftClosed || zatcaLocked;
  const lockReason = zatcaLocked
    ? tZ("LockedTitle")
    : hasReturns
      ? t("LockedHasReturns")
      : shiftClosed
        ? t("LockedShiftClosed")
        : null;
  // اتبعتت فواتير على الإنتاج: مفيش حذف لأي فاتورة خالص
  const deleteLocked =
    productionLive || (isReturn ? shiftClosed || zatcaLocked : locked);
  const deleteReason = productionLive
    ? t("LockedProductionLive")
    : isReturn
      ? zatcaLocked
        ? tZ("LockedTitle")
        : shiftClosed
          ? t("LockedShiftClosed")
          : null
      : lockReason;
  const listPath = isReturn ? "/invoices/sales-returns" : "/invoices/sales";
  const status = isReturn ? null : returnStatus(sale.items);
  const payStatus = paymentStatus(
    sale.totalAmount,
    sale.paidAmount + (sale.settledAmount ?? 0),
  );

  const remove = async () => {
    setDeleting(true);
    const res = isReturn
      ? await deleteSaleReturnAction(sale.id)
      : await deleteSaleAction(sale.id);
    if (!res.success) {
      setDeleting(false);
      return showActionError(res, tAlerts, locale);
    }
    message.success(isReturn ? t("ReturnDeleted") : t("SaleDeleted"));
    router.replace(
      isReturn && sale.returnOf
        ? `/invoices/sales/${sale.returnOf.id}`
        : listPath,
    );
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
          {/* الغيار القادم (زيت...) للسيارة */}
          {(l.nextKm != null || l.nextDate) && (
            <div className="pur-line__code">
              {t("NextChange")}:{" "}
              {[
                l.nextKm != null &&
                  `${Number(l.nextKm).toLocaleString("en")} km`,
                l.nextDate && formatDay(dbDateToDay(l.nextDate)),
              ]
                .filter(Boolean)
                .join(` ${t("Or")} `)}
            </div>
          )}
          <SerialPrintLines
            line={l}
            date={sale.date}
            L={(ar, en) => (locale === "ar" ? ar : en)}
            showWarranty={sale.type !== "return"}
            className="pur-line__code"
          />
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
    ...(!isReturn
      ? [
          {
            title: tP("Returned"),
            key: "returned",
            width: 90,
            align: "center",
            render: (_, l) =>
              l.returnedQty > 0 ? (
                <Tag color={l.returnedQty >= l.qty ? "red" : "orange"}>
                  {Number(l.returnedQty)}
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
    subtotal: sale.subtotal,
    itemsDiscount: sale.itemsDiscount,
    invoiceDiscount: sale.invoiceDiscount,
    net: sale.netAmount,
    tax: sale.taxAmount,
    total: sale.totalAmount,
  };

  return (
    <div className="pur">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          {isReturn ? t("ReturnNo") : t("SaleNo")}{" "}
          <bdi>{saleDocNo(sale.type, sale.number)}</bdi>{" "}
          {sale.source === "pos" && <Tag color="geekblue">{t("FromPos")}</Tag>}
          {!isReturn && (
            <Tag color={PAYMENT_STATUS_COLOR[payStatus]}>
              {tP(`paymentStatus.${payStatus}`)}
            </Tag>
          )}
          {status === "partial" && (
            <Tag color="orange">{tP("status.partial")}</Tag>
          )}
          {status === "full" && <Tag color="red">{tP("status.full")}</Tag>}
        </h1>
        <Space wrap>
          <PrintActions
            autoPrint={notCleared ? false : autoPrint}
            defaultPaper={printSettings.paperSize}
            fileName={saleDocNo(sale.type, sale.number)}
            renderDoc={(paper) =>
              paper === "A4" ? (
                <InvoiceA4
                  kind={isReturn ? "return" : "sale"}
                  doc={sale}
                  company={company}
                  settings={printSettings}
                />
              ) : (
                <SaleDocument
                  settings={{ ...printSettings, paperSize: paper }}
                  company={company}
                  doc={sale}
                  kind={isReturn ? "return" : "sale"}
                />
              )
            }
          />
          {/* ستيكر تغيير الزيت (فاتورة على سيارة) */}
          <OilStickerButton sale={sale} company={company} />
          {!isReturn && canReturn && status !== "full" && (
            <Link href={`/invoices/sales-returns/new?sale=${sale.id}`}>
              <Button icon={<RollbackOutlined />}>{tP("MakeReturn")}</Button>
            </Link>
          )}
          {canCreate && (
            <Link
              href={
                isReturn ? "/invoices/sales-returns/new" : "/invoices/sales/new"
              }
            >
              <Button icon={<PlusOutlined />}>
                {isReturn ? t("NewReturn") : t("NewSale")}
              </Button>
            </Link>
          )}
          {!isReturn && canUpdate && (
            <Tooltip title={lockReason}>
              <Link
                href={`/invoices/sales/${sale.id}/edit`}
                onClick={(e) => locked && e.preventDefault()}
              >
                <Button icon={<EditOutlined />} disabled={locked}>
                  {tP("Edit")}
                </Button>
              </Link>
            </Tooltip>
          )}
          {canDelete && (
            <Popconfirm
              title={isReturn ? t("DeleteReturnTitle") : t("DeleteSaleTitle")}
              description={
                isReturn ? t("DeleteReturnWarning") : t("DeleteSaleWarning")
              }
              okText={tP("DeleteConfirm")}
              okButtonProps={{ danger: true }}
              cancelText={tP("Cancel")}
              onConfirm={remove}
              disabled={deleteLocked}
            >
              <Tooltip title={deleteReason}>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  loading={deleting}
                  disabled={deleteLocked}
                >
                  {tP("Delete")}
                </Button>
              </Tooltip>
            </Popconfirm>
          )}
          <Link href={listPath}>
            <Button icon={<UnorderedListOutlined />}>
              {isReturn ? t("ReturnsList") : t("SalesList")}
            </Button>
          </Link>
        </Space>
      </div>

      {/* الزكاة: بتختفي لو ميزة الزكاة مقفولة للشركة (الباقة) */}
      {(zdoc || zatcaActive) && zatcaEnabled && (
        <ZatcaStatusBox
          sale={sale}
          canSend={canZatcaSend}
          canExport={canZatcaExport}
          renderA4={() => (
            <InvoiceA4
              kind={isReturn ? "return" : "sale"}
              doc={sale}
              company={company}
              settings={printSettings}
            />
          )}
        />
      )}

      <Card size="small" className="mb-3">
        <div className="pur-info">
          <div>
            <span>{t("Customer")}</span>
            <span>
              {(locale === "ar" ? sale.customerArName : sale.customerEnName) ||
                t("CashCustomer")}
            </span>
          </div>
          {sale.customerTaxNo && (
            <div>
              <span>{t("CustomerVat")}</span>
              <bdi>{sale.customerTaxNo}</bdi>
            </div>
          )}
          {/* السيارة (الورش) */}
          {sale.vehiclePlate && (
            <div>
              <span>{t("Vehicle")}</span>
              <span>
                <Link
                  href={`/vehicles?q=${encodeURIComponent(sale.vehiclePlate)}`}
                >
                  <b>
                    <bdi>{sale.vehiclePlate}</bdi>
                  </b>
                </Link>
                {sale.vehicleType ? ` — ${sale.vehicleType}` : ""}
              </span>
            </div>
          )}
          {sale.vehiclePlate && sale.odometer != null && (
            <div>
              <span>{t("Odometer")}</span>
              <bdi>{Number(sale.odometer).toLocaleString("en")} km</bdi>
            </div>
          )}
          <div>
            <span>{t("Date")}</span>
            <bdi>{formatDateTime(sale.date)}</bdi>
          </div>
          <div>
            <span>{tP("Branch")}</span>
            <span>{nameOf(sale.branch)}</span>
          </div>
          <div>
            <span>{tP("Warehouse")}</span>
            <span>{nameOf(sale.warehouse)}</span>
          </div>
          <div>
            <span>{t("Cashier")}</span>
            <span>
              {locale === "ar"
                ? sale.createdBy?.arFullname
                : sale.createdBy?.enFullname}
            </span>
          </div>
          {sale.shift && (
            <div>
              <span>{t("Shift")}</span>
              <Link href={`/sales/shifts/${sale.shift.id}`}>
                {formatDocNo("shift", sale.shift.number)}
              </Link>
            </div>
          )}
          {sale.quotation && (
            <div>
              <span>{t("FromQuotation")}</span>
              <Link href={`/invoices/quotations/${sale.quotation.id}`}>
                {formatDocNo("quotation", sale.quotation.number)}
              </Link>
            </div>
          )}
          {isReturn && sale.returnOf && (
            <div>
              <span>{tP("OriginalInvoice")}</span>
              <Link href={`/invoices/sales/${sale.returnOf.id}`}>
                {saleDocNo("sale", sale.returnOf.number)}
              </Link>
            </div>
          )}
        </div>
        {sale.notes && (
          <div className="mt-3">
            <span className="text-gray-500">{t("Notes")}: </span>
            {sale.notes}
          </div>
        )}
      </Card>

      <Card size="small" className="mb-3">
        <Table
          size="small"
          bordered
          rowKey="id"
          columns={columns}
          dataSource={sale.items}
          pagination={false}
          tableLayout="fixed"
          scroll={{ x: TABLE_WIDTH }}
        />
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            title={isReturn ? t("Refunds") : tP("Payments")}
            className="h-full"
          >
            {sale.payments.length === 0 && (
              <p className="text-gray-500">{tP("NoPayments")}</p>
            )}
            {sale.payments.map((p) => (
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
                <span>{isReturn ? t("Refunded") : tP("Paid")}</span>
                <b>{money(sale.paidAmount)}</b>
              </div>
              <div>
                <span>
                  {isReturn ? t("ToCustomerAccount") : t("CreditOnCustomer")}
                </span>
                <Tag
                  color={
                    sale.remainingAmount - (sale.settledAmount ?? 0) > 0.0001
                      ? "orange"
                      : "green"
                  }
                >
                  {money(sale.remainingAmount - (sale.settledAmount ?? 0))}
                </Tag>
              </div>
              {sale.changeAmount > 0 && (
                <div>
                  <span>{t("Change")}</span>
                  <span>
                    {t("Received")} {money(sale.tenderedAmount)} — {t("Change")}{" "}
                    {money(sale.changeAmount)}
                  </span>
                </div>
              )}
            </div>
            {!isReturn && sale.returns.length > 0 && (
              <div className="mt-4">
                <b>{tP("ReturnsOfInvoice")}</b>
                {sale.returns.map((r) => (
                  <div key={r.id} className="pur-totals">
                    <div>
                      <Link href={`/invoices/sales-returns/${r.id}`}>
                        {t("ReturnNo")} {saleDocNo("return", r.number)}
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
          <Card size="small" title={tP("Totals")} className="h-full">
            <TotalsSummary totals={totals} taxMode="exclusive" />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
