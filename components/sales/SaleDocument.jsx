"use client";

import { useEffect, useState } from "react";
import { qrDataUrl } from "@/lib/qr";
import { imageUrl } from "@/lib/image";
import { zatcaQrValue } from "@/lib/zatca";
import { formatDateTime, formatDay } from "@/lib/dates";
import { formatDocNo, saleDocNo } from "@/lib/doc-number";
import { addressLine, documentInfo } from "@/lib/branch-info";
import { amountInWords, wordsCurrency } from "@/lib/tafqeet";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { PRINT_AREA } from "@/components/printing/invoice/InvoiceView";
import "@/components/printing/invoice/invoice.css";

const BASE_FONT = {
  thermal: { small: 7.5, normal: 8.5, large: 10 },
  A4: { small: 9, normal: 10, large: 11.5 },
};
const LOGO_HEIGHT = { small: 12, medium: 18, large: 26 };
// الكاشير: الشعار أكبر (الطابعة الحرارية بتضيّع التفاصيل الصغيرة)
const LOGO_THERMAL = { small: 16, medium: 24, large: 32 };

// ============================================================
// فاتورة بيع / إشعار دائن (مرتجع) / عرض سعر كما تُطبع
// - نفس إعدادات طباعة الفواتير (الورق، الهوامش، اللغة، الشعار)
// - فاتورة ضريبية (العميل له رقم ضريبي) أو مبسطة، مع QR الزكاة
// kind: "sale" | "return" | "quotation"
// doc: الفاتورة كاملة (getSale / getQuotation)
// ============================================================
export default function SaleDocument({ settings, company, doc, kind }) {
  const { amount: money, symbolNode: symbol, currency } = useCurrency();
  const wc = wordsCurrency(currency);
  const isA4 = settings.paperSize === "A4";
  const lang = settings.language;
  const dir = lang === "en" ? "ltr" : "rtl";
  const width = PRINT_AREA[settings.paperSize] ?? 72;
  const fontPt = BASE_FONT[isA4 ? "A4" : "thermal"][settings.fontSize] ?? 8.5;
  const isQuotation = kind === "quotation";
  const isReturn = kind === "return";

  const L = (ar, en) =>
    lang === "ar" ? ar : lang === "en" ? en : `${ar} / ${en}`;
  const N = (ar, en) =>
    lang === "ar" ? (
      ar
    ) : lang === "en" ? (
      en
    ) : (
      <>
        {ar}
        {en && en !== ar && (
          <div className="inv__sub">
            <bdi>{en}</bdi>
          </div>
        )}
      </>
    );
  const H = (ar, en) =>
    lang === "ar" ? (
      ar
    ) : lang === "en" ? (
      en
    ) : (
      <>
        {ar}
        <div className="inv__sub">{en}</div>
      </>
    );

  const info = documentInfo(company, doc.branch);
  const address = addressLine(info.address, L("رقم فرعي", "Add. No"));
  // ضريبية: عميل له رقم ضريبي / تصدير / الهيئة سجلتها ضريبية (عميل بمعرّف)
  const isStandard = Boolean(
    doc.customerTaxNo || doc.isExport || doc.zatcaDocument?.kind === "standard",
  );
  // الفاتورة الإلكترونية: الـ QR الرسمي (الموقّع / المعتمد من الهيئة)
  // والضريبية قبل اعتماد الهيئة: بدون QR وعليها "غير معتمدة"
  const zdoc = doc.zatcaDocument;
  const notCleared = zdoc?.kind === "standard" && zdoc.status !== "cleared";

  const title = isQuotation
    ? L("عرض سعر", "Quotation")
    : isReturn
      ? L("إشعار دائن (مرتجع مبيعات)", "Credit Note (Sales Return)")
      : doc.isExport
        ? L("فاتورة ضريبية - تصدير", "Tax Invoice - Export")
        : isStandard
          ? L("فاتورة ضريبية", "Tax Invoice")
          : L("فاتورة ضريبية مبسطة", "Simplified Tax Invoice");
  const titleNote = notCleared
    ? L("غير معتمدة من الهيئة بعد", "Not cleared by ZATCA yet")
    : null;

  const number = isQuotation
    ? formatDocNo("quotation", doc.number)
    : saleDocNo(doc.type, doc.number);

  // QR الزكاة (الفواتير والإشعارات فقط)
  const [qr, setQr] = useState(null);
  const qrValue =
    // معاينة قبل الحفظ (doc.preview): من غير QR لأنه بيتعمل بعد التوقيع
    isQuotation || notCleared || doc.preview
      ? null
      : zdoc?.qr?.trim() ||
        zatcaQrValue({
          sellerName: company?.arName || company?.enName || "",
          vatNumber: company?.taxNo || "",
          timestamp: new Date(doc.date).toISOString(),
          total: doc.totalAmount,
          vatTotal: doc.taxAmount,
        });
  useEffect(() => {
    if (!qrValue) return;
    let alive = true;
    qrDataUrl(qrValue)
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [qrValue]);

  const showCode = isA4 && settings.showItemCode;
  const showUnitCol = isA4;
  const showDiscount =
    (isA4 || settings.showDiscount) &&
    doc.items.some((l) => l.itemDiscount > 0);
  const showTax = isA4 || settings.showItemTax;
  const cashier = doc.createdBy
    ? lang === "en"
      ? doc.createdBy.enFullname
      : doc.createdBy.arFullname
    : null;
  const customerName = lang === "en" ? doc.customerEnName : doc.customerArName;

  return (
    <div
      className={`inv ${isA4 ? "inv--a4" : "inv--thermal"} ${settings.paperSize === "58mm" ? "inv--58" : ""}`}
      dir={dir}
      style={{
        width: `${width}mm`,
        paddingTop: `${settings.marginTop}mm`,
        paddingBottom: `${settings.marginBottom}mm`,
        paddingRight: `${settings.marginRight}mm`,
        paddingLeft: `${settings.marginLeft}mm`,
        fontSize: `${fontPt}pt`,
      }}
    >
      <header className="inv__header">
        {settings.showLogo && company?.logo && (
          <img
            className="inv__logo"
            src={imageUrl(company.logo)}
            alt=""
            style={{
              height: `${isA4 ? LOGO_HEIGHT[settings.logoSize] * 1.3 : LOGO_THERMAL[settings.logoSize]}mm`,
            }}
          />
        )}
        <div className="inv__company">
          <div className="inv__company-name">
            {company ? N(company.arName, company.enName) : ""}
          </div>
          {doc.branch && <div>{N(doc.branch.arName, doc.branch.enName)}</div>}
          {info.taxNo && (
            <div>
              {L("الرقم الضريبي", "VAT No")}: <bdi>{info.taxNo}</bdi>
            </div>
          )}
          {info.registrationNo && (
            <div>
              {L("السجل التجاري", "CR No")}: <bdi>{info.registrationNo}</bdi>
            </div>
          )}
          {address && <div>{address}</div>}
          {settings.showPhone !== false && info.phone && (
            <div>
              {L("الجوال", "Phone")}: <bdi>{info.phone}</bdi>
            </div>
          )}
          {settings.showEmail && info.email && (
            <div>
              {L("البريد الإلكتروني", "Email")}: <bdi>{info.email}</bdi>
            </div>
          )}
        </div>
      </header>

      <div className="inv__title">{title}</div>
      {titleNote && <div className="inv__title-note">{titleNote}</div>}

      <div className="inv__meta">
        <div>
          <span>
            {isQuotation
              ? L("رقم العرض", "Quotation No")
              : isReturn
                ? L("رقم الإشعار", "Note No")
                : L("رقم الفاتورة", "Invoice No")}
          </span>
          <bdi>{number}</bdi>
        </div>
        <div>
          <span>{L("التاريخ", "Date")}</span>
          <bdi>{formatDateTime(doc.date)}</bdi>
        </div>
        {isQuotation && doc.validUntil && (
          <div>
            <span>{L("صالح حتى", "Valid until")}</span>
            <bdi>{formatDay(doc.validUntil)}</bdi>
          </div>
        )}
        {isReturn && doc.returnOf && (
          <div>
            <span>{L("الفاتورة الأصلية", "Original invoice")}</span>
            <bdi>{saleDocNo("sale", doc.returnOf.number)}</bdi>
          </div>
        )}
        <div>
          <span>{L("العميل", "Customer")}</span>
          <span>{customerName || L("عميل نقدي", "Cash customer")}</span>
        </div>
        {doc.customerTaxNo && (
          <div>
            <span>{L("الرقم الضريبي للعميل", "Customer VAT")}</span>
            <bdi>{doc.customerTaxNo}</bdi>
          </div>
        )}
        {settings.showCashier && cashier && (
          <div>
            <span>
              {isQuotation
                ? L("المندوب", "Sales rep")
                : L("الكاشير", "Cashier")}
            </span>
            <span>{cashier}</span>
          </div>
        )}
      </div>

      <table className="inv__items">
        <thead>
          <tr>
            {showCode && <th>{H("الكود", "Code")}</th>}
            <th className="inv__col-name">{H("الصنف", "Item")}</th>
            <th>{H("الكمية", "Qty")}</th>
            {showUnitCol && <th>{H("الوحدة", "Unit")}</th>}
            <th>{H("السعر", "Price")}</th>
            {showDiscount && <th>{H("الخصم", "Disc.")}</th>}
            {showTax && <th>{H("الضريبة", "VAT")}</th>}
            <th>{H("الإجمالي", "Total")}</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((l) => {
            const unitAr = l.unit?.arName;
            const unitEn = l.unit?.enName;
            const arName =
              !isA4 && unitAr ? `${l.arName} - ${unitAr}` : l.arName;
            const enName =
              !isA4 && unitEn ? `${l.enName} - ${unitEn}` : l.enName;
            return (
              <tr key={l.id}>
                {showCode && (
                  <td>
                    <bdi>{l.code}</bdi>
                  </td>
                )}
                <td className="inv__col-name">
                  {N(arName, enName)}
                  {l.note && <div className="inv__note">{l.note}</div>}
                </td>
                <td>{Number(l.qty)}</td>
                {showUnitCol && <td>{N(unitAr, unitEn)}</td>}
                <td>{money(l.price)}</td>
                {showDiscount && <td>{money(l.itemDiscount)}</td>}
                {showTax && <td>{money(l.taxAmount)}</td>}
                <td>{money(l.totalAmount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="inv__totals">
        <div>
          <span>{L("الإجمالي", "Subtotal")}</span>
          <bdi>{money(doc.subtotal)}</bdi>
        </div>
        {doc.itemsDiscount + doc.invoiceDiscount > 0 && (
          <div>
            <span>{L("الخصم", "Discount")}</span>
            <bdi>-{money(doc.itemsDiscount + doc.invoiceDiscount)}</bdi>
          </div>
        )}
        <div>
          <span>{L("الصافي قبل الضريبة", "Net (excl. VAT)")}</span>
          <bdi>{money(doc.netAmount)}</bdi>
        </div>
        <div>
          <span>{L("ضريبة القيمة المضافة", "VAT")}</span>
          <bdi>{money(doc.taxAmount)}</bdi>
        </div>
        <div className="inv__grand">
          <span>{L("الإجمالي شامل الضريبة", "Total (incl. VAT)")}</span>
          <bdi>
            {money(doc.totalAmount)} {symbol}
          </bdi>
        </div>
        {!isQuotation &&
          doc.payments?.map((p) => (
            <div key={p.id}>
              <span>{N(p.paymentMethod.arName, p.paymentMethod.enName)}</span>
              <bdi>{money(p.amount)}</bdi>
            </div>
          ))}
        {!isQuotation && doc.remainingAmount > 0 && (
          <div>
            <span>
              {isReturn
                ? L("لحساب العميل", "To customer account")
                : L("آجل", "Credit")}
            </span>
            <bdi>{money(doc.remainingAmount)}</bdi>
          </div>
        )}
        {!isQuotation && doc.changeAmount > 0 && (
          <>
            <div>
              <span>{L("المستلم", "Received")}</span>
              <bdi>{money(doc.tenderedAmount)}</bdi>
            </div>
            <div>
              <span>{L("الباقي للعميل", "Change")}</span>
              <bdi>{money(doc.changeAmount)}</bdi>
            </div>
          </>
        )}
      </div>

      {/* المبلغ بالحروف */}
      <div className="inv__words">
        {lang !== "en" && <div>{amountInWords(doc.totalAmount, "ar", wc)}</div>}
        {lang !== "ar" && (
          <div dir="ltr">{amountInWords(doc.totalAmount, "en", wc)}</div>
        )}
      </div>

      {settings.showBankAccount &&
        isQuotation &&
        (company?.iban || company?.bankAccountNumber) && (
          <div className="inv__bank">
            <div className="inv__bank-title">
              {L("الحساب البنكي", "Bank account")}
            </div>
            {company.bankName && (
              <div>
                <span>{L("البنك", "Bank")}</span>
                <span>{company.bankName}</span>
              </div>
            )}
            {company.iban && (
              <div>
                <span>IBAN</span>
                <bdi>{company.iban}</bdi>
              </div>
            )}
          </div>
        )}

      <footer className="inv__footer">
        {!isQuotation && (
          <div className="inv__qr">
            {qr ? (
              <img src={qr} alt="ZATCA QR" />
            ) : (
              <div className="inv__qr-empty" />
            )}
          </div>
        )}
        {doc.notes && <p className="inv__note">{doc.notes}</p>}
        {lang !== "en" && settings.footerTextAr && (
          <p className="inv__note">{settings.footerTextAr}</p>
        )}
        {lang !== "ar" && settings.footerTextEn && (
          <p className="inv__note" dir="ltr">
            {settings.footerTextEn}
          </p>
        )}
      </footer>
    </div>
  );
}
