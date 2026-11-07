"use client";

import { imageUrl } from "@/lib/image";
import { formatDateTime, formatDay } from "@/lib/dates";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCompany } from "@/components/common/CompanyProvider";
import "./laundry-receipt.css";

// ============================================================
// إيصال اشتراك المغسلة (كاشير 80/58mm): المدفوع والمشحون والرصيد
// w: نتيجة createWallet { number, voucher, customer, paidAmount, creditAmount, balance }
// ============================================================
export default function LaundryWalletReceipt({ wallet: w, phone, paperSize, lang = "both" }) {
  const company = useCompany();
  const { amount: money, symbolNode: symbol } = useCurrency();
  const dir = lang === "en" ? "ltr" : "rtl";
  const L = (ar, en) =>
    lang === "ar" ? ar : lang === "en" ? en : `${ar} / ${en}`;
  const companyName = company
    ? lang === "en"
      ? company.enName
      : company.arName
    : "";
  const row = (label, value) => (
    <div>
      <span>{label}</span>
      <b>
        <bdi>{value}</bdi>
      </b>
    </div>
  );

  return (
    <div
      className="lrc lrc--thermal"
      dir={dir}
      style={{ width: paperSize === "58mm" ? "48mm" : "72mm" }}
    >
      <header className="lrc__header">
        {company?.logo && (
          // مستند مطبوع: <img> عادية (next/image مش بتشتغل في الطباعة)
          // eslint-disable-next-line @next/next/no-img-element
          <img className="lrc__logo" src={imageUrl(company.logo)} alt="" />
        )}
        <div className="lrc__company">
          <div className="lrc__company-name">{companyName}</div>
        </div>
      </header>

      <div className="lrc__title">{L("إيصال اشتراك", "Subscription receipt")}</div>

      <div className="lrc__meta">
        {row(L("رقم الاشتراك", "Subscription No"), `LW-${w.number}`)}
        {w.voucher && row(L("سند القبض", "Receipt voucher"), w.voucher.number)}
        {row(L("العميل", "Customer"), w.customer.arName)}
        {row(L("الجوال", "Phone"), phone)}
        {row(L("التاريخ", "Date"), formatDateTime(new Date()))}
      </div>

      <div className="lrc__totals">
        {row(L("المدفوع", "Paid"), `${money(w.paidAmount)}`)}
        {row(L("رصيد الاشتراك", "Credit"), `${money(w.creditAmount)}`)}
        {w.creditAmount > w.paidAmount &&
          row(
            L("المكافأة", "Bonus"),
            money(w.creditAmount - w.paidAmount),
          )}
        <div className="lrc__grand">
          <span>{L("رصيدك الآن", "Your balance")}</span>
          <b>
            <bdi>
              {money(w.balance)} {symbol}
            </bdi>
          </b>
        </div>
        {w.expiresAt &&
          row(L("صالح حتى", "Valid until"), formatDay(w.expiresAt))}
      </div>

      <div className="lrc__footer">
        {L("شكراً لاشتراككم", "Thank you for subscribing")}
      </div>
    </div>
  );
}
