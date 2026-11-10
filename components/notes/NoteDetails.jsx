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
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { formatDateTime, formatDay } from "@/lib/dates";
import { formatDocNo, purchaseDocNo, saleDocNo } from "@/lib/doc-number";
import { noteLineKind } from "@/lib/note-lines";
import { qtyText } from "@/lib/unit-qty";
import { deleteNoteAction } from "@/actions/note.actions";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PrintActions from "@/components/printing/PrintActions";
import InvoiceA4 from "@/components/printing/invoice/InvoiceA4";
import SaleDocument from "@/components/sales/SaleDocument";
import PurchaseDocument from "@/components/purchases/PurchaseDocument";
import ZatcaStatusBox from "@/components/zatca/ZatcaStatusBox";
import TotalsSummary from "@/components/purchases/TotalsSummary";
import { LineNoteText } from "@/components/purchases/LineNote";
import { INVOICE_BASE, NOTE_BASE, NOTE_COLOR } from "./NotesList";
import "@/components/purchases/purchases.css";

// ============================================================
// عرض إشعار دائن / مدين (للعميل أو من المورد): البيانات والسطور والمدفوعات
// والطباعة، وحالة الزكاة (إشعار العميل)
// ============================================================
export default function NoteDetails({
  note,
  company,
  printSettings,
  canCreate,
  canUpdate = false,
  canDelete,
  productionLive = false,
  autoPrint,
  zatcaActive = false,
  zatcaEnabled = false,
  canZatcaSend = false,
  canZatcaExport = false,
}) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Notes");
  const tP = useTranslations("Purchases");
  const tZ = useTranslations("Zatca");
  const tAlerts = useTranslations("Alerts");
  const { amount: money } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const side = note.side;
  const isSale = side === "sale";
  const isCredit = note.type === "credit";
  const base = NOTE_BASE[side];
  const docNo = isSale ? saleDocNo : purchaseDocNo;
  // نوع الطباعة: إشعار العميل credit/debit، والمورد purchaseCredit/purchaseDebit
  const printKind = isSale
    ? note.type
    : isCredit
      ? "purchaseCredit"
      : "purchaseDebit";

  // الحذف: ممنوع بعد التوقيع للهيئة / الإرسال على الإنتاج / قفل الوردية / السداد
  const zdoc = note.zatcaDocument;
  const notCleared = zdoc?.kind === "standard" && zdoc.status !== "cleared";
  const shiftClosed = note.shift && note.shift.status !== "open";
  const settled = (note.settledAmount ?? 0) > 0;
  const deleteReason = productionLive
    ? t("LockedProductionLive")
    : zdoc
      ? tZ("LockedTitle")
      : shiftClosed
        ? t("LockedShiftClosed")
        : settled
          ? t("LockedSettled")
          : null;

  // التعديل: نفس قيود الحذف ما عدا الإرسال على الإنتاج (رقمه مبيتغيرش)
  const editReason = zdoc
    ? tZ("LockedTitle")
    : shiftClosed
      ? t("LockedShiftClosed")
      : settled
        ? t("LockedSettled")
        : null;

  const remove = async () => {
    setDeleting(true);
    const res = await deleteNoteAction({ side, id: note.id });
    if (!res.success) {
      setDeleting(false);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("Deleted"));
    router.replace(
      note.returnOf ? `${INVOICE_BASE[side]}/${note.returnOf.id}` : base,
    );
    router.refresh();
  };

  const partyAr = isSale ? note.customerArName : note.supplierArName;
  const partyEn = isSale ? note.customerEnName : note.supplierEnName;
  const partyTax = isSale ? note.customerTaxNo : note.supplierTaxNo;

  const columns = [
    {
      title: "#",
      key: "i",
      width: 45,
      align: "center",
      render: (_, __, i) => i + 1,
    },
    {
      title: t("LineKind"),
      key: "kind",
      width: 150,
      render: (_, l) => {
        // بند ثابت، أو مضاف من المستخدم (اسمه من القائمة)
        const k = noteLineKind(l.lineKind) ?? note.kindNames?.[l.lineKind];
        return k ? (locale === "ar" ? k.ar : k.en || k.ar) : "—";
      },
    },
    {
      title: t("Description"),
      key: "name",
      width: 240,
      render: (_, l) => (
        <div>
          <div className="pur-line__name">{nameOf(l)}</div>
          {l.code && (
            <div className="pur-line__code">
              <bdi>{l.code}</bdi>
            </div>
          )}
          <LineNoteText note={l.note} />
        </div>
      ),
    },
    {
      title: tP("Unit"),
      key: "unit",
      width: 90,
      render: (_, l) => nameOf(l.unit) || "—",
    },
    {
      title: tP("Qty"),
      key: "qty",
      width: 75,
      align: "center",
      render: (_, l) => qtyText(l.qty),
    },
    {
      title: t("PriceOrAmount"),
      key: "price",
      width: 110,
      align: "end",
      render: (_, l) => money(l.price),
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

  const totals = {
    subtotal: note.subtotal,
    itemsDiscount: 0,
    invoiceDiscount: 0,
    net: note.netAmount,
    tax: note.taxAmount,
    total: note.totalAmount,
  };
  const open = note.remainingAmount - (note.settledAmount ?? 0);

  const renderA4 = () => (
    <InvoiceA4
      kind={printKind}
      doc={note}
      company={company}
      settings={printSettings}
    />
  );

  return (
    <div className="pur">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          {t(`type.${note.type}`)} <bdi>{note.docNo}</bdi>{" "}
          <Tag color={NOTE_COLOR[note.type]}>
            {isSale ? t("ForCustomer") : t("FromSupplier")}
          </Tag>
        </h1>
        <Space wrap>
          <PrintActions
            autoPrint={notCleared ? false : autoPrint}
            defaultPaper={isSale ? printSettings.paperSize : "A4"}
            fileName={note.docNo}
            renderDoc={(paper) =>
              paper === "A4" ? (
                renderA4()
              ) : isSale ? (
                <SaleDocument
                  settings={{ ...printSettings, paperSize: paper }}
                  company={company}
                  doc={note}
                  kind={note.type}
                />
              ) : (
                <PurchaseDocument
                  settings={{ ...printSettings, paperSize: paper }}
                  company={company}
                  purchase={note}
                />
              )
            }
          />
          {canCreate && (
            <Link href={`${base}/new?type=${note.type}`}>
              <Button icon={<PlusOutlined />}>{t(`new.${note.type}`)}</Button>
            </Link>
          )}
          {canUpdate && (
            <Tooltip title={editReason}>
              <Link
                href={`${base}/${note.id}/edit`}
                onClick={(e) => editReason && e.preventDefault()}
              >
                <Button icon={<EditOutlined />} disabled={Boolean(editReason)}>
                  {tP("Edit")}
                </Button>
              </Link>
            </Tooltip>
          )}
          {canDelete && (
            <Popconfirm
              title={t("DeleteTitle")}
              description={t("DeleteWarning")}
              okText={tP("DeleteConfirm")}
              okButtonProps={{ danger: true }}
              cancelText={tP("Cancel")}
              onConfirm={remove}
              disabled={Boolean(deleteReason)}
            >
              <Tooltip title={deleteReason}>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  loading={deleting}
                  disabled={Boolean(deleteReason)}
                >
                  {tP("Delete")}
                </Button>
              </Tooltip>
            </Popconfirm>
          )}
          <Link href={base}>
            <Button icon={<UnorderedListOutlined />}>
              {t(`list.${side}`)}
            </Button>
          </Link>
        </Space>
      </div>

      {/* الزكاة (إشعار العميل بس) */}
      {isSale && (zdoc || zatcaActive) && zatcaEnabled && (
        <ZatcaStatusBox
          sale={note}
          canSend={canZatcaSend}
          canExport={canZatcaExport}
          renderA4={renderA4}
        />
      )}

      <Card size="small" className="mb-3">
        <div className="pur-info">
          <div>
            <span>{isSale ? t("Customer") : t("Supplier")}</span>
            <span>
              {(locale === "ar" ? partyAr : partyEn) ||
                (isSale ? t("CashCustomer") : "—")}
            </span>
          </div>
          {partyTax && (
            <div>
              <span>{t("PartyVat")}</span>
              <bdi>{partyTax}</bdi>
            </div>
          )}
          <div>
            <span>{t("Date")}</span>
            <bdi>{formatDateTime(note.date)}</bdi>
          </div>
          <div>
            <span>{t("OriginalInvoice")}</span>
            {note.returnOf ? (
              <Link href={`${INVOICE_BASE[side]}/${note.returnOf.id}`}>
                <bdi>{docNo(note.returnOf.type, note.returnOf.number)}</bdi>
              </Link>
            ) : (
              <bdi>{note.billingRef || "—"}</bdi>
            )}
          </div>
          {!isSale && note.supplierInvoiceNo && (
            <div>
              <span>{t("SupplierNoteNo")}</span>
              <bdi>{note.supplierInvoiceNo}</bdi>
            </div>
          )}
          {!isSale && note.supplierInvoiceDate && (
            <div>
              <span>{t("SupplierNoteDate")}</span>
              <bdi>{formatDay(note.supplierInvoiceDate)}</bdi>
            </div>
          )}
          <div>
            <span>{tP("Branch")}</span>
            <span>{nameOf(note.branch)}</span>
          </div>
          <div>
            <span>{t("User")}</span>
            <span>
              {locale === "ar"
                ? note.createdBy?.arFullname
                : note.createdBy?.enFullname}
            </span>
          </div>
          {note.shift && (
            <div>
              <span>{t("Shift")}</span>
              <Link href={`/sales/shifts/${note.shift.id}`}>
                {formatDocNo("shift", note.shift.number)}
              </Link>
            </div>
          )}
        </div>
        <div className="mt-3">
          <span className="text-gray-500">{t("Reason")}: </span>
          <b>{note.noteReason}</b>
          {note.noteReasonEn && (
            <>
              {" — "}
              <bdi>{note.noteReasonEn}</bdi>
            </>
          )}
        </div>
        {note.notes && (
          <div className="mt-2">
            <span className="text-gray-500">{t("Notes")}: </span>
            {note.notes}
          </div>
        )}
      </Card>

      <Card size="small" className="mb-3">
        <Table
          size="small"
          bordered
          rowKey="id"
          columns={columns}
          dataSource={note.items}
          pagination={false}
          tableLayout="fixed"
          scroll={{ x: TABLE_WIDTH }}
        />
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            title={isCredit ? t("Refunds") : t("Collections")}
            className="h-full"
          >
            {note.payments.length === 0 && (
              <p className="text-gray-500">{tP("NoPayments")}</p>
            )}
            {note.payments.map((p) => (
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
                <span>{isCredit ? t("Refunded") : t("Collected")}</span>
                <b>{money(note.paidAmount)}</b>
              </div>
              <div>
                <span>{t(`OnAccount.${side}.${note.type}`)}</span>
                <Tag color={open > 0.0001 ? "orange" : "green"}>
                  {money(open)}
                </Tag>
              </div>
            </div>
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
