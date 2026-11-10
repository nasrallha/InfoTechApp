"use client";

import { useEffect, useState } from "react";
import { qtyText, savedLineConversion } from "@/lib/unit-qty";
import { qrDataUrl } from "@/lib/qr";
import { imageUrl } from "@/lib/image";
import { zatcaQrValue } from "@/lib/zatca";
import { formatDateTime, formatDay } from "@/lib/dates";
import { formatDocNo, purchaseDocNo, saleDocNo } from "@/lib/doc-number";
import { addressLine, documentInfo } from "@/lib/branch-info";
import { amountInWords, wordsCurrency } from "@/lib/tafqeet";
import { useCurrency } from "@/components/common/CurrencyProvider";
import "./invoice-a4.css";
import SerialPrintLines from "@/components/serials/SerialPrintLines";

const ACCENT = {
  // sale: "#1f4e78",
  // return: "#a93226",
  // quotation: "#6c3483",
  // purchase: "#1d6f5f",
  // purchaseReturn: "#b9770e",

  sale: "#57606f",
  return: "#57606f",
  quotation: "#57606f",
  purchase: "#57606f",
  purchaseReturn: "#57606f",
  // الإشعارات (للعميل / من المورد)
  credit: "#57606f",
  debit: "#57606f",
  purchaseCredit: "#57606f",
  purchaseDebit: "#57606f",
};

// الإشعار: الفاتورة الأصلية أو المرجع، والسبب
const NOTE_KINDS = ["credit", "debit", "purchaseCredit", "purchaseDebit"];

// ============================================================
// فاتورة A4 احترافية (مبيعات / مرتجع / عرض سعر / مشتريات / مرتجع مشتريات)
// - الرأس: الشعار وبيانات الشركة، ومربع العنوان والرقم و QR الزكاة
// - مربعا العميل/المورد وبيانات المستند
// - جدول الأصناف (صفوف ملونة بالتبادل)
// - المبلغ بالحروف، الحساب البنكي، الشروط، الإجماليات، التوقيعات
// kind: "sale" | "return" | "quotation" | "purchase" | "purchaseReturn"
//       | "credit" | "debit" (إشعار للعميل) | "purchaseCredit" | "purchaseDebit"
// settings: إعدادات طباعة الفواتير (اللغة، الشعار، الكود، البنك، النص السفلي)
// ============================================================
export default function InvoiceA4({ kind, doc, company, settings }) {
  const { amount: money, symbolNode: symbol, currency } = useCurrency();
  const lang = settings.language;
  const dir = lang === "en" ? "ltr" : "rtl";
  const accent = ACCENT[kind];
  const isSale = ["sale", "return", "quotation", "credit", "debit"].includes(
    kind,
  );
  const isQuotation = kind === "quotation";
  const isPurchase = !isSale;
  const isNote = NOTE_KINDS.includes(kind);
  // المرتجع والإشعار الدائن: المبلغ "على الحساب" مش "آجل"
  const isReturn = [
    "return",
    "purchaseReturn",
    "credit",
    "purchaseCredit",
  ].includes(kind);

  const L = (ar, en) =>
    lang === "ar" ? ar : lang === "en" ? en : `${ar} / ${en}`;
  // سطرين (عربي + إنجليزي) في وضع اللغتين
  const N = (ar, en) =>
    lang === "ar" ? (
      ar
    ) : lang === "en" ? (
      en || ar
    ) : (
      <>
        {ar}
        {en && en !== ar && (
          <div className="a4__sub">
            <bdi>{en}</bdi>
          </div>
        )}
      </>
    );

  const info = documentInfo(company, doc.branch);
  const address = addressLine(info.address, L("رقم فرعي", "Add. No"));
  // ضريبية: عميل له رقم ضريبي / تصدير / الهيئة سجلتها ضريبية (عميل بمعرّف)
  const isStandard =
    isSale &&
    Boolean(
      doc.customerTaxNo ||
      doc.isExport ||
      doc.zatcaDocument?.kind === "standard",
    );

  const title = {
    sale: doc.isExport
      ? ["فاتورة ضريبية - تصدير", "Tax Invoice - Export"]
      : isStandard
        ? ["فاتورة ضريبية", "Tax Invoice"]
        : ["فاتورة ضريبية مبسطة", "Simplified Tax Invoice"],
    return: ["إشعار دائن", "Credit Note"],
    credit: ["إشعار دائن", "Credit Note"],
    debit: ["إشعار مدين", "Debit Note"],
    quotation: ["عرض سعر", "Quotation"],
    purchase: ["فاتورة مشتريات", "Purchase Invoice"],
    purchaseReturn: ["مرتجع مشتريات", "Purchase Return"],
    purchaseCredit: ["إشعار دائن من المورد", "Supplier Credit Note"],
    purchaseDebit: ["إشعار مدين من المورد", "Supplier Debit Note"],
  }[kind];

  const number = isQuotation
    ? formatDocNo("quotation", doc.number)
    : isSale
      ? saleDocNo(doc.type, doc.number)
      : purchaseDocNo(doc.type, doc.number);

  // QR الزكاة لفواتير البيع والإشعارات
  const [qr, setQr] = useState(null);
  // الفاتورة الإلكترونية: الـ QR الرسمي (الموقّع / المعتمد من الهيئة)
  // والضريبية قبل اعتماد الهيئة: بدون QR وعليها "غير معتمدة"
  const zdoc = doc.zatcaDocument;
  const notCleared = zdoc?.kind === "standard" && zdoc.status !== "cleared";
  const qrValue =
    // معاينة قبل الحفظ (doc.preview): من غير QR لأنه بيتعمل بعد التوقيع
    isSale && !isQuotation && !notCleared && !doc.preview
      ? zdoc?.qr?.trim() ||
        zatcaQrValue({
          sellerName: company?.arName || company?.enName || "",
          vatNumber: company?.taxNo || "",
          timestamp: new Date(doc.date).toISOString(),
          total: doc.totalAmount,
          vatTotal: doc.taxAmount,
        })
      : null;
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

  const partyAr = isSale ? doc.customerArName : doc.supplierArName;
  const partyEn = isSale ? doc.customerEnName : doc.supplierEnName;
  const partyTax = isSale ? doc.customerTaxNo : doc.supplierTaxNo;
  const user = doc.createdBy
    ? lang === "en"
      ? doc.createdBy.enFullname
      : doc.createdBy.arFullname
    : null;
  const showTax = !(isPurchase && doc.taxMode === "none");
  const discount = (doc.itemsDiscount ?? 0) + (doc.invoiceDiscount ?? 0);
  const showDiscount = doc.items.some((l) => Number(l.itemDiscount) > 0);
  const wc = wordsCurrency(currency);

  const meta = [
    [
      isNote ? L("رقم الإشعار", "Note No") : L("رقم الفاتورة", "Invoice No"),
      <bdi key="n">{number}</bdi>,
    ],
    [L("التاريخ", "Date"), <bdi key="d">{formatDateTime(doc.date)}</bdi>],
    isQuotation &&
      doc.validUntil && [
        L("صالح حتى", "Valid until"),
        <bdi key="v">{formatDay(doc.validUntil)}</bdi>,
      ],
    kind === "return" &&
      doc.returnOf && [
        L("الفاتورة الأصلية", "Original invoice"),
        <bdi key="o">{saleDocNo("sale", doc.returnOf.number)}</bdi>,
      ],
    kind === "purchaseReturn" &&
      doc.returnOf && [
        L("فاتورة الشراء", "Purchase invoice"),
        <bdi key="o">{formatDocNo("purchase", doc.returnOf.number)}</bdi>,
      ],
    // الإشعار: الفاتورة الأصلية (أو المرجع) والسبب
    isNote &&
      (doc.returnOf || doc.billingRef) && [
        L("الفاتورة الأصلية", "Original invoice"),
        <bdi key="ref">
          {doc.returnOf
            ? isSale
              ? saleDocNo("sale", doc.returnOf.number)
              : purchaseDocNo("purchase", doc.returnOf.number)
            : doc.billingRef}
        </bdi>,
      ],
    isNote &&
      doc.noteReason && [
        L("سبب الإشعار", "Reason"),
        N(doc.noteReason, doc.noteReasonEn || doc.noteReason),
      ],
    isPurchase &&
      doc.supplierInvoiceNo && [
        isNote
          ? L("رقم إشعار المورد", "Supplier note No")
          : L("رقم فاتورة المورد", "Supplier invoice"),
        <bdi key="s">{doc.supplierInvoiceNo}</bdi>,
      ],
    isPurchase &&
      doc.supplierInvoiceDate && [
        isNote
          ? L("تاريخ إشعار المورد", "Supplier note date")
          : L("تاريخ فاتورة المورد", "Supplier inv. date"),
        <bdi key="sd">{formatDay(doc.supplierInvoiceDate)}</bdi>,
      ],
    doc.branch && [
      L("الفرع", "Branch"),
      lang === "en" ? doc.branch.enName : doc.branch.arName,
    ],
    settings.showCashier &&
      user && [
        isSale ? L("البائع", "Salesperson") : L("المستخدم", "User"),
        user,
      ],
  ].filter(Boolean);

  const totals = [
    [L("الإجمالي قبل الخصم", "Subtotal"), money(doc.subtotal)],
    discount > 0 && [L("الخصم", "Discount"), `-${money(discount)}`],
    showTax && [
      L("الإجمالي بدون الضريبة", "Total excl. VAT"),
      money(doc.netAmount),
    ],
    showTax && [L("ضريبة القيمة المضافة", "VAT"), money(doc.taxAmount)],
  ].filter(Boolean);

  const payments = !isQuotation ? (doc.payments ?? []) : [];

  return (
    <div className="a4" dir={dir} style={{ "--accent": accent }}>
      {/* ============ الرأس ============ */}
      <header className="a4__head">
        <div className="a4__company">
          {settings.showLogo !== false && company?.logo && (
            <img className="a4__logo" src={imageUrl(company.logo)} alt="" />
          )}
          <div>
            <div className="a4__company-name">
              {company ? N(company.arName, company.enName) : ""}
            </div>
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
            {settings.showPhone !== false && info.phone && (
              <div>
                {L("الجوال", "Phone")}: <bdi>{info.phone}</bdi>
              </div>
            )}
            {settings.showEmail && company?.email && (
              <div>
                {L("البريد الإلكتروني", "Email")}: <bdi>{company.email}</bdi>
              </div>
            )}

            {address && <div>{address}</div>}
            {/* {info.phone && (
              <div>
                <bdi>{info.phone}</bdi>
                {company?.email ? (
                  <>
                    {" · "}
                    <bdi>{company.email}</bdi>
                  </>
                ) : null}
              </div>
            )} */}
          </div>
        </div>
        <div className="a4__title-box">
          <div className="a4__title">
            {lang === "both" ? title[0] : L(...title)}
          </div>
          {lang === "both" && <div className="a4__title-en">{title[1]}</div>}
          {notCleared && (
            <div className="a4__title-note">
              {L("غير معتمدة من الهيئة بعد", "Not cleared by ZATCA yet")}
            </div>
          )}
          <div className="a4__number">
            <bdi>{number}</bdi>
          </div>
          {qrValue &&
            (qr ? (
              <img className="a4__qr" src={qr} alt="QR" />
            ) : (
              <div className="a4__qr a4__qr--empty" />
            ))}
        </div>
      </header>

      {/* ============ الطرف + بيانات المستند ============ */}
      <section className="a4__boxes">
        <div className="a4__box">
          <div className="a4__box-title text-center">
            {isSale
              ? L("بيانات العميل", "Bill to")
              : L("بيانات المورد", "Supplier")}
          </div>
          <div className="a4__party-name">
            {partyAr || partyEn
              ? N(partyAr, partyEn)
              : L("عميل نقدي", "Cash customer")}
          </div>
          {partyTax && (
            <div>
              {L("الرقم الضريبي", "VAT No")}: <bdi>{partyTax}</bdi>
            </div>
          )}
          {doc.customer?.phone && (
            <div>
              {L("الجوال", "Phone")}: <bdi>{doc.customer.phone}</bdi>
            </div>
          )}
        </div>
        <div className="a4__box">
          <div className="a4__box-title text-center">
            {L("بيانات الفاتورة", "Invoice details")}
          </div>
          {meta.map(([label, value]) => (
            <div key={label} className="a4__kv">
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
      </section>

      {/* ============ الأصناف ============ */}
      <table className="a4__items">
        <thead>
          <tr>
            <th>#</th>
            {settings.showItemCode !== false && <th>{L("الكود", "Code")}</th>}
            <th className="a4__col-name">{L("الصنف", "Description")}</th>
            <th>{L("الوحدة", "Unit")}</th>
            <th>{L("الكمية", "Qty")}</th>
            <th>{L("السعر", "Price")}</th>
            {showDiscount && <th>{L("الخصم", "Disc.")}</th>}
            {showTax && <th>{L("الضريبة", "VAT")}</th>}
            <th>{L("الإجمالي", "Amount")}</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((l, i) => (
            <tr key={l.id}>
              <td className="a4__c">{i + 1}</td>
              {settings.showItemCode !== false && (
                <td className="a4__c">
                  <bdi>{l.code}</bdi>
                </td>
              )}
              <td className="a4__col-name">
                {N(l.arName, l.enName)}
                {l.note && <div className="a4__note">{l.note}</div>}
                {isSale && !isQuotation && (
                  <SerialPrintLines
                    line={l}
                    date={doc.date}
                    L={L}
                    showWarranty={!isReturn}
                    className="a4__note"
                  />
                )}
              </td>
              <td className="a4__c">{N(l.unit?.arName, l.unit?.enName)}</td>
              <td className="a4__c">
                {qtyText(l.qty)}
                {/* السيراميك: الكمية بالوحدة التانية (كراتين / م²) */}
                {(() => {
                  const c = savedLineConversion(l);
                  return c ? (
                    <div className="a4__sub">
                      {qtyText(c.qty)} {N(c.unit?.arName, c.unit?.enName)}
                    </div>
                  ) : null;
                })()}
              </td>
              <td className="a4__n">{money(l.price)}</td>
              {showDiscount && (
                <td className="a4__n">
                  {Number(l.itemDiscount) ? money(l.itemDiscount) : ""}
                </td>
              )}
              {showTax && (
                <td className="a4__n">
                  {money(l.taxAmount)}
                  {Number(l.taxRate) > 0 && (
                    <div className="a4__sub">{Number(l.taxRate)}%</div>
                  )}
                </td>
              )}
              <td className="a4__n">
                <b>{money(l.totalAmount)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ============ الإجماليات + المبلغ بالحروف ============ */}
      <section className="a4__bottom">
        <div className="a4__left">
          <div className="a4__words">
            <div className="a4__box-title">
              {L("المبلغ بالحروف", "Amount in words")}
            </div>
            {lang !== "en" && (
              <div>{amountInWords(doc.totalAmount, "ar", wc)}</div>
            )}
            {lang !== "ar" && (
              <div dir="ltr">{amountInWords(doc.totalAmount, "en", wc)}</div>
            )}
          </div>
          {payments.length > 0 && (
            <div className="a4__payments">
              {payments.map((p) => (
                <div key={p.id} className="a4__kv">
                  <span>
                    {N(p.paymentMethod.arName, p.paymentMethod.enName)}
                  </span>
                  <b>{money(p.amount)}</b>
                </div>
              ))}
              {doc.remainingAmount > 0 && (
                <div className="a4__kv">
                  <span>
                    {isReturn
                      ? L("على الحساب", "To account")
                      : L("المتبقي (آجل)", "Balance due (credit)")}
                  </span>
                  <b>{money(doc.remainingAmount)}</b>
                </div>
              )}
            </div>
          )}
          {settings.showBankAccount &&
            isSale &&
            (company?.iban || company?.bankAccountNumber) && (
              <div className="a4__bank">
                <div className="a4__box-title">
                  {L("الحساب البنكي", "Bank details")}
                </div>
                {company.bankName && (
                  <div className="a4__kv">
                    <span>{L("البنك", "Bank")}</span>
                    <b>{company.bankName}</b>
                  </div>
                )}
                {company.bankAccountName && (
                  <div className="a4__kv">
                    <span>{L("اسم الحساب", "Account name")}</span>
                    <b>{company.bankAccountName}</b>
                  </div>
                )}
                {company.bankAccountNumber && (
                  <div className="a4__kv">
                    <span>{L("رقم الحساب", "Account No")}</span>
                    <b>
                      <bdi>{company.bankAccountNumber}</bdi>
                    </b>
                  </div>
                )}
                {company.iban && (
                  <div className="a4__kv">
                    <span>IBAN</span>
                    <b>
                      <bdi>{company.iban}</bdi>
                    </b>
                  </div>
                )}
              </div>
            )}
          {doc.notes && (
            <div className="a4__notes">
              <div className="a4__box-title">{L("ملاحظات", "Notes")}</div>
              <div>{doc.notes}</div>
            </div>
          )}
        </div>
        <div className="a4__totals">
          {totals.map(([label, value]) => (
            <div key={label} className="a4__kv">
              <span>{label}</span>
              <b>
                <bdi>{value}</bdi>
              </b>
            </div>
          ))}
          <div className="a4__grand">
            <span>{L("الإجمالي شامل الضريبة", "Total incl. VAT")}</span>
            <b>
              <bdi>
                {money(doc.totalAmount)} {symbol}
              </bdi>
            </b>
          </div>
        </div>
      </section>

      {/* ============ التوقيعات ============ */}
      <section className="a4__signs">
        <div>
          <span>
            {isSale ? L("البائع", "Seller") : L("المستلم", "Received by")}
          </span>
          <div className="a4__sign-line">{user}</div>
        </div>
        <div>
          <span>
            {isSale
              ? L("توقيع العميل", "Customer signature")
              : L("المورد", "Supplier")}
          </span>
          <div className="a4__sign-line" />
        </div>
        <div>
          <span>{L("الختم", "Stamp")}</span>
          <div className="a4__sign-line" />
        </div>
      </section>

      {(settings.footerTextAr || settings.footerTextEn) && (
        <footer className="a4__footer">
          {lang !== "en" && settings.footerTextAr && (
            <p>{settings.footerTextAr}</p>
          )}
          {lang !== "ar" && settings.footerTextEn && (
            <p dir="ltr">{settings.footerTextEn}</p>
          )}
        </footer>
      )}
    </div>
  );
}
