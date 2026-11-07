"use client";

import { useEffect, useState } from "react";
import { qtyText } from "@/lib/unit-qty";
import { qrDataUrl } from "@/lib/qr";
import { imageUrl } from "@/lib/image";
import { zatcaQrValue } from "@/lib/zatca";
import { useCurrency } from "@/components/common/CurrencyProvider";
import "./invoice.css";

// عرض الورق بالمللي
export const PAPER_WIDTH = { A4: 210, "80mm": 80, "58mm": 58 };
// العرض اللي الطابعة بتطبع فيه فعلاً (الكاشير 80mm بيطبع 72mm بس، و58mm بيطبع 48mm)
// المستند بيتعمل على العرض ده وبيتوسّط في الورقة، فمفيش كلام بيتقص من الجنب
export const PRINT_AREA = { A4: 210, "80mm": 72, "58mm": 48 };

// حجم الخط الأساسي (pt) حسب الورق والحجم المختار - لكل المستندات المطبوعة
// الكاشير أكبر شوية: 72mm بيستحمل 9.5pt، والخط الصغير بيطلع متقطع في الحرارية
export const BASE_FONT = {
  // الكاشير: أصغر نص درجة عشان الفاتورة ماتطولش (العادي 9pt)
  thermal: { small: 8, normal: 9, large: 10.5 },
  A4: { small: 9, normal: 10, large: 11.5 },
};

// ارتفاع الشعار بالمللي
const LOGO_HEIGHT = { small: 12, medium: 18, large: 26 };
// الكاشير: الشعار أكبر (الطابعة الحرارية بتضيّع التفاصيل الصغيرة)
const LOGO_THERMAL = { small: 12, medium: 18, large: 24 };

// ============================================================
// الفاتورة كما تُطبع (نفس المكون للمعاينة والطباعة الفعلية)
// settings: إعدادات الطباعة، company: بيانات الشركة، branch: الفرع
// invoice: { number, date, cashier, customer, items, paymentMethod }
//   item: { code, arName, enName, unitAr, unitEn, qty, price, discount, taxRate }
//   الأسعار بدون الضريبة، والضريبة تُحسب لكل سطر
// ============================================================
export default function InvoiceView({ settings, company, branch, invoice }) {
  // المبالغ بخانات العملة الأساسية، والإجمالي النهائي معه رمز العملة
  const { amount: money, symbolNode: currencySymbol } = useCurrency();
  const isA4 = settings.paperSize === "A4";
  const lang = settings.language; // ar / en / both
  const dir = lang === "en" ? "ltr" : "rtl";
  const width = PRINT_AREA[settings.paperSize] ?? 72;
  const fontPt = BASE_FONT[isA4 ? "A4" : "thermal"][settings.fontSize] ?? 9.5;

  // نص حسب اللغة: عربي / إنجليزي / الاثنين
  const L = (ar, en) =>
    lang === "ar" ? ar : lang === "en" ? en : `${ar} / ${en}`;
  // اسم بالعربي والإنجليزي (في "الاثنين" يظهر الاثنان في سطرين)
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

  // عنوان عمود في الجدول: في "الاثنين" العربي فوق والإنجليزي تحته (حتى لا يعرض الجدول)
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

  // ------------------------------------------------------------
  // الحسابات
  // ------------------------------------------------------------
  const lines = invoice.items.map((it) => {
    const gross = it.qty * it.price;
    const net = gross - (it.discount ?? 0);
    const tax = (net * (it.taxRate ?? 0)) / 100;
    return { ...it, gross, net, tax, total: net + tax };
  });
  const subtotal = lines.reduce((s, l) => s + l.gross, 0);
  const discount = lines.reduce((s, l) => s + (l.discount ?? 0), 0);
  const vat = lines.reduce((s, l) => s + l.tax, 0);
  const total = lines.reduce((s, l) => s + l.total, 0);

  // فاتورة ضريبية (العميل له رقم ضريبي) أو مبسطة
  const isStandard = Boolean(invoice.customer?.vatNo);
  const title = isStandard
    ? L("فاتورة ضريبية", "Tax Invoice")
    : L("فاتورة ضريبية مبسطة", "Simplified Tax Invoice");

  // العنوان الوطني في سطر واحد (الموجود فقط)
  const address = company
    ? [
        company.buildingNo,
        company.street,
        company.district,
        company.city,
        company.postalCode,
        company.additionalNo &&
          `${L("رقم فرعي", "Add. No")} ${company.additionalNo}`,
      ]
        .filter(Boolean)
        .join("، ")
    : "";

  // QR الزكاة
  const [qr, setQr] = useState(null);
  const qrValue = zatcaQrValue({
    sellerName: company?.arName || company?.enName || "",
    vatNumber: company?.taxNo || "",
    timestamp: invoice.date,
    total,
    vatTotal: vat,
  });
  useEffect(() => {
    let alive = true;
    qrDataUrl(qrValue)
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [qrValue]);

  // التاريخ بتوقيت السعودية دائماً (نفس النتيجة في السيرفر والمتصفح وأي جهاز)
  const dateText = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(invoice.date));

  // أعمدة الأصناف
  const showDiscount = settings.showDiscount;
  const showTax = settings.showItemTax;

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
      {/* ============ رأس الفاتورة ============ */}
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
            {company
              ? N(company.arName, company.enName)
              : L("اسم الشركة", "Company name")}
          </div>
          {branch && <div>{N(branch.arName, branch.enName)}</div>}
          {company?.taxNo && (
            <div>
              {L("الرقم الضريبي", "VAT No")}: <bdi>{company.taxNo}</bdi>
            </div>
          )}
          {company?.registrationNo && (
            <div>
              {L("السجل التجاري", "CR No")}: <bdi>{company.registrationNo}</bdi>
            </div>
          )}
          {address && <div>{address}</div>}
          {settings.showPhone !== false && company?.phone && (
            <div>
              {L("الجوال", "Phone")}: <bdi>{company.phone}</bdi>
            </div>
          )}
          {settings.showEmail && company?.email && (
            <div>
              {L("البريد الإلكتروني", "Email")}: <bdi>{company.email}</bdi>
            </div>
          )}
        </div>
      </header>

      <div className="inv__title">{title}</div>

      {/* بيانات الفاتورة + الكاشير + العميل */}
      <div className="inv__meta">
        <div>
          <span>{L("رقم الفاتورة", "Invoice No")}</span>
          <bdi>{invoice.number}</bdi>
        </div>
        <div>
          <span>{L("التاريخ", "Date")}</span>
          <bdi>{dateText}</bdi>
        </div>
        {settings.showCashier && invoice.cashier && (
          <div>
            <span>{L("الكاشير", "Cashier")}</span>
            <span>{invoice.cashier}</span>
          </div>
        )}
        {settings.showCustomer && invoice.customer && (
          <>
            <div>
              <span>{L("العميل", "Customer")}</span>
              <span>{invoice.customer.name}</span>
            </div>
            {invoice.customer.vatNo && (
              <div>
                <span>{L("الرقم الضريبي للعميل", "Customer VAT")}</span>
                <bdi>{invoice.customer.vatNo}</bdi>
              </div>
            )}
          </>
        )}
      </div>

      {/* ============ الأصناف ============ */}
      {/* الأصناف
          - A4: كل حاجة أعمدة (الكود، الوحدة، الخصم، الضريبة)
          - الكاشير: الوحدة مع اسم الصنف، والكود سطر صغير تحته، والخصم والضريبة أعمدة */}
      <table className="inv__items">
        <thead>
          <tr>
            {isA4 && settings.showItemCode && <th>{H("الكود", "Code")}</th>}
            <th className="inv__col-name">{H("الصنف", "Item")}</th>
            <th>{H("الكمية", "Qty")}</th>
            {isA4 && settings.showUnit && <th>{H("الوحدة", "Unit")}</th>}
            <th>{H("السعر", "Price")}</th>
            {showDiscount && <th>{H("الخصم", "Disc.")}</th>}
            {showTax && <th>{H("الضريبة", "VAT")}</th>}
            <th>{H("الإجمالي", "Total")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            // الكاشير: "مياه معدنية - كرتونة"
            const withUnit = !isA4 && settings.showUnit;
            const arName =
              withUnit && l.unitAr ? `${l.arName} - ${l.unitAr}` : l.arName;
            const enName =
              withUnit && l.unitEn ? `${l.enName} - ${l.unitEn}` : l.enName;

            return (
              <tr key={i}>
                {isA4 && settings.showItemCode && (
                  <td>
                    <bdi>{l.code}</bdi>
                  </td>
                )}
                <td className="inv__col-name">
                  {N(arName, enName)}
                  {!isA4 && settings.showItemCode && (
                    <div className="inv__sub">
                      <bdi>{l.code}</bdi>
                    </div>
                  )}
                </td>
                <td>{qtyText(l.qty)}</td>
                {isA4 && settings.showUnit && <td>{N(l.unitAr, l.unitEn)}</td>}
                <td>{money(l.price)}</td>
                {showDiscount && <td>{money(l.discount)}</td>}
                {showTax && <td>{money(l.tax)}</td>}
                <td>{money(l.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ============ الإجماليات ============ */}
      <div className="inv__totals">
        <div>
          <span>{L("الإجمالي قبل الضريبة", "Subtotal (excl. VAT)")}</span>
          <bdi>{money(subtotal)}</bdi>
        </div>
        {showDiscount && discount > 0 && (
          <div>
            <span>{L("الخصم", "Discount")}</span>
            <bdi>-{money(discount)}</bdi>
          </div>
        )}
        <div>
          <span>{L("ضريبة القيمة المضافة 15%", "VAT 15%")}</span>
          <bdi>{money(vat)}</bdi>
        </div>
        <div className="inv__grand">
          <span>{L("الإجمالي شامل الضريبة", "Total (incl. VAT)")}</span>
          <bdi>
            {money(total)} {currencySymbol}
          </bdi>
        </div>
        {invoice.paymentMethod && (
          <div>
            <span>{L("طريقة الدفع", "Payment")}</span>
            <span>{invoice.paymentMethod}</span>
          </div>
        )}
      </div>

      {/* ============ الحساب البنكي (لو مفعّل وفيه بيانات) ============ */}
      {settings.showBankAccount &&
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
            {company.bankAccountName && (
              <div>
                <span>{L("اسم الحساب", "Account name")}</span>
                <span>{company.bankAccountName}</span>
              </div>
            )}
            {company.bankAccountNumber && (
              <div>
                <span>{L("رقم الحساب", "Account No")}</span>
                <bdi>{company.bankAccountNumber}</bdi>
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

      {/* ============ ذيل الفاتورة ============ */}
      <footer className="inv__footer">
        <div className="inv__qr">
          {qr ? (
            <img src={qr} alt="ZATCA QR" />
          ) : (
            <div className="inv__qr-empty" />
          )}
        </div>
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
