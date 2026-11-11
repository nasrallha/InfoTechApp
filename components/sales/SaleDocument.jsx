"use client";

import { useEffect, useState } from "react";
import { qtyText, savedLineConversion } from "@/lib/unit-qty";
import { qrDataUrl } from "@/lib/qr";
import { imageUrl } from "@/lib/image";
import { zatcaQrValue } from "@/lib/zatca";
import { dbDateToDay, formatDateTime, formatDay } from "@/lib/dates";
import { formatDocNo, saleDocNo } from "@/lib/doc-number";
import { addressLine, documentInfo } from "@/lib/branch-info";
import { amountInWords, wordsCurrency } from "@/lib/tafqeet";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { BASE_FONT, PRINT_AREA } from "@/components/printing/invoice/InvoiceView";
import "@/components/printing/invoice/invoice.css";
import SerialPrintLines from "@/components/serials/SerialPrintLines";

const LOGO_HEIGHT = { small: 12, medium: 18, large: 26 };
// الكاشير: الشعار أكبر (الطابعة الحرارية بتضيّع التفاصيل الصغيرة)
const LOGO_THERMAL = { small: 16, medium: 24, large: 32 };

// ============================================================
// فاتورة بيع / إشعار دائن (مرتجع) / عرض سعر كما تُطبع
// - نفس إعدادات طباعة الفواتير (الورق، الهوامش، اللغة، الشعار)
// - فاتورة ضريبية (العميل له رقم ضريبي) أو مبسطة، مع QR الزكاة
// kind: "sale" | "return" | "quotation" | "credit" | "debit" (الإشعارات)
// doc: الفاتورة كاملة (getSale / getQuotation)
// ============================================================
// أنواع طلب المطعم على الفاتورة [عربي، إنجليزي]
const REST_TYPES = {
  local: ["محلي", "Dine-in"],
  dinein: ["محلي (طاولة)", "Dine-in (table)"],
  takeaway: ["سفري", "Takeaway"],
  delivery: ["توصيل", "Delivery"],
  app: ["تطبيق", "App"],
};

export default function SaleDocument({ settings, company, doc, kind }) {
  const { amount: money, symbolNode: symbol, currency } = useCurrency();
  const wc = wordsCurrency(currency);
  const isA4 = settings.paperSize === "A4";
  const lang = settings.language;
  const dir = lang === "en" ? "ltr" : "rtl";
  const width = PRINT_AREA[settings.paperSize] ?? 72;
  const fontPt = BASE_FONT[isA4 ? "A4" : "thermal"][settings.fontSize] ?? 9.5;
  const isQuotation = kind === "quotation";
  const isNote = kind === "credit" || kind === "debit";
  // المرتجع والإشعار الدائن: المبلغ "لحساب العميل"
  const isReturn = kind === "return" || kind === "credit";

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
  // التصدير: ضريبية أو مبسطة حسب اختيار الفاتورة
  const simplifiedExport = doc.isExport && doc.exportKind === "simplified";
  const isStandard = Boolean(
    doc.customerTaxNo ||
      (doc.isExport && !simplifiedExport) ||
      doc.zatcaDocument?.kind === "standard",
  );
  // الفاتورة الإلكترونية: الـ QR الرسمي (الموقّع / المعتمد من الهيئة)
  // والضريبية قبل اعتماد الهيئة: بدون QR وعليها "غير معتمدة"
  const zdoc = doc.zatcaDocument;
  const notCleared = zdoc?.kind === "standard" && zdoc.status !== "cleared";

  const title = isQuotation
    ? L("عرض سعر", "Quotation")
    : kind === "credit"
      ? L("إشعار دائن", "Credit Note")
      : kind === "debit"
        ? L("إشعار مدين", "Debit Note")
    : isReturn
      ? L("إشعار دائن (مرتجع مبيعات)", "Credit Note (Sales Return)")
      : doc.isExport
        ? simplifiedExport
          ? L("فاتورة ضريبية مبسطة - تصدير", "Simplified Tax Invoice - Export")
          : L("فاتورة ضريبية - تصدير", "Tax Invoice - Export")
        : isStandard
          ? L("فاتورة ضريبية", "Tax Invoice")
          : L("فاتورة ضريبية مبسطة", "Simplified Tax Invoice");
  const titleNote = notCleared
    ? L("غير معتمدة من الهيئة بعد", "Not cleared by ZATCA yet")
    : null;

  const number = isQuotation
    ? formatDocNo("quotation", doc.number, doc.docCode)
    : saleDocNo(doc.type, doc.number, doc.docCode);

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
  // فاتورة المغسلة (وحدة laundry): كود العميل وجواله + إجمالي السطر = الكمية × السعر
  // (الخصم والضريبة في الإجماليات تحت) + المخصوم من الاشتراك والرصيد الباقي
  const laundry = doc.laundry ?? null;
  // فاتورة المطعم: الطلب (رقمه اليومي ونوعه والطاولة...)
  const rest = doc.restaurantOrder ?? null;
  // سطور الرسوم (أصناف كودها FEE-...): بتظهر تحت الأصناف مع الإجماليات مش في الجدول
  // (في البيانات والزكاة سطور عادية بضريبتها)
  const isFee = (l) => /^FEE-/.test(l.code ?? "");
  const itemLines = doc.items.filter((l) => !isFee(l));
  const feeLines = doc.items.filter(isFee);

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
              : isReturn || isNote
                ? L("رقم الإشعار", "Note No")
                : L("رقم الفاتورة", "Invoice No")}
          </span>
          <bdi>{number}</bdi>
        </div>
        <div>
          <span>{L("التاريخ", "Date")}</span>
          <bdi>{formatDateTime(doc.date)}</bdi>
        </div>
        {/* المطعم: رقم الطلب ونوعه والطاولة / التطبيق / التوصيل */}
        {rest && (
          <>
            <div className="sd-order-no">
              <span>{L("رقم الطلب", "Order No")}</span>
              <bdi>{rest.dailyNo}</bdi>
            </div>
            <div>
              <span>{L("نوع الطلب", "Order type")}</span>
              <span>{REST_TYPES[rest.orderType] ? L(...REST_TYPES[rest.orderType]) : rest.orderType}</span>
            </div>
            {rest.tableNo && (
              <div>
                <span>{L("رقم الطاولة", "Table No")}</span>
                <bdi>{rest.tableNo}</bdi>
              </div>
            )}
            {rest.channel && (
              <div>
                <span>{L("التطبيق", "App")}</span>
                <span>
                  {L(rest.channel.arName, rest.channel.enName)}
                  {rest.channelOrderNo ? <> (<bdi>{rest.channelOrderNo}</bdi>)</> : null}
                </span>
              </div>
            )}
            {rest.orderType === "delivery" && rest.phone && (
              <div>
                <span>{L("جوال العميل", "Customer phone")}</span>
                <bdi>{rest.phone}</bdi>
              </div>
            )}
            {rest.orderType === "delivery" && rest.address && (
              <div>
                <span>{L("العنوان", "Address")}</span>
                <span>{rest.address}</span>
              </div>
            )}
            {rest.driver && (
              <div>
                <span>{L("السائق", "Driver")}</span>
                <span>{rest.driver.name}</span>
              </div>
            )}
          </>
        )}
        {isQuotation && doc.validUntil && (
          <div>
            <span>{L("صالح حتى", "Valid until")}</span>
            <bdi>{formatDay(doc.validUntil)}</bdi>
          </div>
        )}
        {(isReturn || isNote) && (doc.returnOf || doc.billingRef) && (
          <div>
            <span>{L("الفاتورة الأصلية", "Original invoice")}</span>
            <bdi>
              {doc.returnOf
                ? saleDocNo("sale", doc.returnOf.number, doc.returnOf.docCode)
                : doc.billingRef}
            </bdi>
          </div>
        )}
        {/* الإشعار: السبب */}
        {isNote && doc.noteReason && (
          <div>
            <span>{L("سبب الإشعار", "Reason")}</span>
            <span>
              {N(doc.noteReason, doc.noteReasonEn || doc.noteReason)}
            </span>
          </div>
        )}
        <div>
          <span>{L("العميل", "Customer")}</span>
          <span>{customerName || L("عميل نقدي", "Cash customer")}</span>
        </div>
        {laundry && doc.customer?.code != null && (
          <div>
            <span>{L("كود العميل", "Customer code")}</span>
            <bdi>{doc.customer.code}</bdi>
          </div>
        )}
        {laundry && doc.customer?.phone && (
          <div>
            <span>{L("جوال العميل", "Customer phone")}</span>
            <bdi>{doc.customer.phone}</bdi>
          </div>
        )}
        {doc.customerTaxNo && (
          <div>
            <span>{L("الرقم الضريبي للعميل", "Customer VAT")}</span>
            <bdi>{doc.customerTaxNo}</bdi>
          </div>
        )}
        {/* السيارة (الورش): اللوحة والنوع والعداد */}
        {doc.vehiclePlate && (
          <div>
            <span>{L("رقم اللوحة", "Plate No.")}</span>
            <bdi>
              <b>{doc.vehiclePlate}</b>
            </bdi>
          </div>
        )}
        {doc.vehiclePlate && doc.vehicleType && (
          <div>
            <span>{L("نوع السيارة", "Vehicle")}</span>
            <span>{doc.vehicleType}</span>
          </div>
        )}
        {doc.vehiclePlate && doc.odometer != null && (
          <div>
            <span>{L("قراءة العداد", "Odometer")}</span>
            <bdi>{Number(doc.odometer).toLocaleString("en")} km</bdi>
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
          {itemLines.map((l) => {
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
                  {/* الغيار الجاي (زيت...) */}
                  {!isReturn && (l.nextKm != null || l.nextDate) && (
                    <div className="inv__note">
                      {L("الغيار القادم", "Next change")}:{" "}
                      {[
                        l.nextKm != null &&
                          `${Number(l.nextKm).toLocaleString("en")} km`,
                        l.nextDate && formatDay(dbDateToDay(l.nextDate)),
                      ]
                        .filter(Boolean)
                        .join(L(" أو ", " or "))}
                    </div>
                  )}
                  {!isQuotation && (
                    <SerialPrintLines
                      line={l}
                      date={doc.date}
                      L={L}
                      showWarranty={!isReturn}
                      className="inv__note"
                    />
                  )}
                </td>
                <td>
                  {qtyText(l.qty)}
                  {/* السيراميك: الكمية بالوحدة التانية (كراتين / م²) */}
                  {(() => {
                    const c = savedLineConversion(l);
                    return c ? (
                      <div style={{ fontSize: "0.85em" }}>
                        ({qtyText(c.qty)} {N(c.unit?.arName, c.unit?.enName)})
                      </div>
                    ) : null;
                  })()}
                </td>
                {showUnitCol && <td>{N(unitAr, unitEn)}</td>}
                <td>{money(l.price)}</td>
                {showDiscount && <td>{money(l.itemDiscount)}</td>}
                {showTax && <td>{money(l.taxAmount)}</td>}
                <td>
                  {money(
                    laundry
                      ? Math.round(Number(l.qty) * Number(l.price) * 100) / 100
                      : l.totalAmount,
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* الرسوم (الخدمة / التوصيل / التبغ): تحت الأصناف من غير كمية ولا وحدة، بالمبلغ الشامل */}
      {feeLines.length > 0 && (
        <div className="inv__totals inv__fees">
          {feeLines.map((l) => (
            <div key={l.id}>
              <span>{N(l.arName, l.enName)}</span>
              <bdi>{money(l.totalAmount)}</bdi>
            </div>
          ))}
        </div>
      )}

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
        {/* المغسلة: المخصوم من الاشتراك والرصيد الباقي للعميل */}
        {/* (المرتجع: المسترد للاشتراك) */}
        {laundry?.walletUsed ? (
          <>
            <div>
              <span>
                {laundry.walletUsed > 0
                  ? L("المخصوم من الاشتراك", "Deducted from subscription")
                  : L("المسترد إلى الاشتراك", "Refunded to subscription")}
              </span>
              <bdi>{money(Math.abs(laundry.walletUsed))}</bdi>
            </div>
            {laundry.walletBalance != null && (
              <div className="inv__grand">
                <span>{L("رصيد الاشتراك المتبقي", "Subscription balance left")}</span>
                <bdi>
                  {money(laundry.walletBalance)} {symbol}
                </bdi>
              </div>
            )}
          </>
        ) : null}
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
