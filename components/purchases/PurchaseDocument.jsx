"use client";

import { imageUrl } from "@/lib/image";
import { qtyText } from "@/lib/unit-qty";
import { formatDateTime, formatDay } from "@/lib/dates";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { BASE_FONT, PRINT_AREA } from "@/components/printing/invoice/InvoiceView";
import "@/components/printing/invoice/invoice.css";
import { formatDocNo } from "@/lib/doc-number";
import { addressLine, documentInfo } from "@/lib/branch-info";

const LOGO_HEIGHT = { small: 12, medium: 18, large: 26 };

const TAX_MODE_TEXT = {
  exclusive: ["الأسعار غير شاملة الضريبة", "Prices exclude VAT"],
  inclusive: ["الأسعار شاملة الضريبة", "Prices include VAT"],
  none: ["بدون ضريبة", "No VAT"],
};

// ============================================================
// فاتورة شراء / مرتجع مشتريات كما تُطبع
// تستخدم نفس إعدادات طباعة الفواتير (الورق، الهوامش، اللغة، الشعار)
// purchase: الفاتورة كاملة من getPurchase
// ============================================================
export default function PurchaseDocument({ settings, company, purchase }) {
  const { amount: money, symbolNode: symbol } = useCurrency();
  const isA4 = settings.paperSize === "A4";
  const lang = settings.language;
  const dir = lang === "en" ? "ltr" : "rtl";
  const width = PRINT_AREA[settings.paperSize] ?? 72;
  const fontPt = BASE_FONT[isA4 ? "A4" : "thermal"][settings.fontSize] ?? 9.5;
  const isReturn = purchase.type === "return";

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

  // عنوان وتليفون وسجل الفرع (أو الشركة لو الفرع بدون بيانات)
  const info = documentInfo(company, purchase.branch);
  const address = addressLine(info.address, L("رقم فرعي", "Add. No"));

  const title = isReturn
    ? L("مرتجع مشتريات", "Purchase Return")
    : L("فاتورة مشتريات", "Purchase Invoice");

  // A4: كل الأعمدة، الكاشير: حسب الإعدادات
  const showCode = isA4 && settings.showItemCode;
  const showUnitCol = isA4;
  const showDiscount = isA4 || settings.showDiscount;
  const showTax = (isA4 || settings.showItemTax) && purchase.taxMode !== "none";
  const user = purchase.createdBy
    ? lang === "en"
      ? purchase.createdBy.enFullname
      : purchase.createdBy.arFullname
    : null;

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
      {/* ============ الرأس ============ */}
      <header className="inv__header">
        {settings.showLogo && company?.logo && (
          <img
            className="inv__logo"
            src={imageUrl(company.logo)}
            alt=""
            style={{
              height: `${LOGO_HEIGHT[settings.logoSize] * (isA4 ? 1.3 : 1)}mm`,
            }}
          />
        )}
        <div className="inv__company">
          <div className="inv__company-name">
            {company ? N(company.arName, company.enName) : ""}
          </div>
          {purchase.branch && (
            <div>{N(purchase.branch.arName, purchase.branch.enName)}</div>
          )}
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

      <div className="inv__meta">
        <div>
          <span>
            {isReturn
              ? L("رقم المرتجع", "Return No")
              : L("رقم الفاتورة", "Invoice No")}
          </span>
          <bdi>{formatDocNo(purchase.type, purchase.number)}</bdi>
        </div>
        <div>
          <span>{L("التاريخ", "Date")}</span>
          <bdi>{formatDateTime(purchase.date)}</bdi>
        </div>
        {isReturn && purchase.returnOf && (
          <div>
            <span>{L("فاتورة الشراء", "Purchase Invoice")}</span>
            <bdi>{formatDocNo("purchase", purchase.returnOf.number)}</bdi>
          </div>
        )}
        <div>
          <span>{L("المورد", "Supplier")}</span>
          <span>{N(purchase.supplierArName, purchase.supplierEnName)}</span>
        </div>
        {purchase.supplierTaxNo && (
          <div>
            <span>{L("الرقم الضريبي للمورد", "Supplier VAT")}</span>
            <bdi>{purchase.supplierTaxNo}</bdi>
          </div>
        )}
        {purchase.supplierInvoiceNo && (
          <div>
            <span>
              {isReturn
                ? L("رقم إشعار المورد", "Supplier Note No")
                : L("رقم فاتورة المورد", "Supplier Invoice No")}
            </span>
            <bdi>{purchase.supplierInvoiceNo}</bdi>
          </div>
        )}
        {purchase.supplierInvoiceDate && (
          <div>
            <span>{L("تاريخ فاتورة المورد", "Supplier Invoice Date")}</span>
            <bdi>{formatDay(purchase.supplierInvoiceDate)}</bdi>
          </div>
        )}
        {settings.showCashier && user && (
          <div>
            <span>{L("المستخدم", "User")}</span>
            <span>{user}</span>
          </div>
        )}
      </div>

      {/* ============ الأصناف ============ */}
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
          {purchase.items.map((l) => {
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
                <td>{qtyText(l.qty)}</td>
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

      {/* ============ الإجماليات ============ */}
      <div className="inv__totals">
        <div>
          <span>{L("الإجمالي", "Subtotal")}</span>
          <bdi>{money(purchase.subtotal)}</bdi>
        </div>
        {purchase.itemsDiscount > 0 && (
          <div>
            <span>{L("خصم الأصناف", "Items discount")}</span>
            <bdi>-{money(purchase.itemsDiscount)}</bdi>
          </div>
        )}
        {purchase.invoiceDiscount > 0 && (
          <div>
            <span>{L("خصم الفاتورة", "Invoice discount")}</span>
            <bdi>-{money(purchase.invoiceDiscount)}</bdi>
          </div>
        )}
        {purchase.taxMode !== "none" && (
          <>
            <div>
              <span>{L("الصافي قبل الضريبة", "Net (excl. VAT)")}</span>
              <bdi>{money(purchase.netAmount)}</bdi>
            </div>
            <div>
              <span>{L("ضريبة القيمة المضافة", "VAT")}</span>
              <bdi>{money(purchase.taxAmount)}</bdi>
            </div>
          </>
        )}
        <div className="inv__grand">
          <span>{L("الإجمالي النهائي", "Total")}</span>
          <bdi>
            {money(purchase.totalAmount)} {symbol}
          </bdi>
        </div>

        {purchase.payments.map((p) => (
          <div key={p.id}>
            <span>{N(p.paymentMethod.arName, p.paymentMethod.enName)}</span>
            <bdi>{money(p.amount)}</bdi>
          </div>
        ))}
        {purchase.remainingAmount > 0 && (
          <div>
            <span>{L("آجل", "Credit")}</span>
            <bdi>{money(purchase.remainingAmount)}</bdi>
          </div>
        )}
      </div>

      <footer className="inv__footer">
        <p className="inv__note">{L(...TAX_MODE_TEXT[purchase.taxMode])}</p>
        {purchase.notes && <p className="inv__note">{purchase.notes}</p>}
      </footer>
    </div>
  );
}
