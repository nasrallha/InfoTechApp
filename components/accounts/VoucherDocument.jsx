"use client";

import { imageUrl } from "@/lib/image";
import { formatDateTime } from "@/lib/dates";
import { formatDocNo, saleDocNo } from "@/lib/doc-number";
import { addressLine, documentInfo } from "@/lib/branch-info";
import { amountInWords, wordsCurrency } from "@/lib/tafqeet";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCompany } from "@/components/common/CompanyProvider";
import "./voucher.css";

const TITLES = {
  receipt: ["سند قبض", "Receipt Voucher"],
  payment: ["سند صرف", "Payment Voucher"],
  settlement: ["سند تسوية", "Settlement Voucher"],
};

// ============================================================
// السند كما يُطبع (A4 أو كاشير 80/58mm)
// lang: "ar" | "en" | "both" (من إعدادات طباعة الفواتير)
// ============================================================
export default function VoucherDocument({
  voucher: v,
  paperSize,
  lang = "both",
}) {
  const company = useCompany();
  const { amount: money, symbolNode: symbol, currency } = useCurrency();
  const isA4 = paperSize === "A4";
  const dir = lang === "en" ? "ltr" : "rtl";
  const L = (ar, en) =>
    lang === "ar" ? ar : lang === "en" ? en : `${ar} / ${en}`;
  const info = documentInfo(company, v.branch);
  const address = addressLine(info.address, L("رقم فرعي", "Add. No"));
  const [arTitle, enTitle] = TITLES[v.type];
  const settlementTitle =
    v.type === "settlement"
      ? v.partyType === "customer"
        ? L("خصم مسموح به", "Discount allowed")
        : L("خصم مكتسب", "Discount received")
      : null;

  const partyLabel = {
    customer: L("استلمنا من العميل", "Received from customer"),
    other: L("استلمنا من", "Received from"),
    supplier: L("صرفنا للمورد", "Paid to supplier"),
    expense: L("بند المصروف", "Expense"),
  }[v.partyType];
  const partyLabelSettlement =
    v.partyType === "customer"
      ? L("العميل", "Customer")
      : L("المورد", "Supplier");

  const party =
    lang === "en"
      ? v.partyEnName || v.partyArName
      : v.partyArName || v.partyEnName;
  const wc = wordsCurrency(currency);
  const words =
    lang === "en"
      ? amountInWords(v.amount, "en", wc)
      : lang === "ar"
        ? amountInWords(v.amount, "ar", wc)
        : null;
  const user =
    lang === "en" ? v.createdBy?.enFullname : v.createdBy?.arFullname;
  const methodName = v.paymentMethod
    ? lang === "en"
      ? v.paymentMethod.enName
      : v.paymentMethod.arName
    : null;
  const companyName = company
    ? lang === "en"
      ? company.enName
      : company.arName
    : "";

  return (
    <div
      className={`vch ${isA4 ? "vch--a4" : "vch--thermal"}`}
      dir={dir}
      style={{ width: isA4 ? "210mm" : paperSize === "58mm" ? "48mm" : "72mm" }}
    >
      <header className="vch__header">
        {company?.logo && (
          <img className="vch__logo" src={imageUrl(company.logo)} alt="" />
        )}
        <div className="vch__company">
          <div className="vch__company-name">{companyName}</div>
          {v.branch && (
            <div>{lang === "en" ? v.branch.enName : v.branch.arName}</div>
          )}
          {info.taxNo && (
            <div>
              {L("الرقم الضريبي", "VAT No")}: <bdi>{info.taxNo}</bdi>
            </div>
          )}
          {isA4 && address && <div>{address}</div>}
          {info.phone && (
            <div>
              <bdi>{info.phone}</bdi>
            </div>
          )}
        </div>
      </header>

      <div className={`vch__title vch__title--${v.type}`}>
        {lang === "en"
          ? enTitle
          : lang === "ar"
            ? arTitle
            : `${arTitle} - ${enTitle}`}
        {settlementTitle && (
          <div className="vch__subtitle">{settlementTitle}</div>
        )}
      </div>

      <div className="vch__meta">
        <div>
          <span>{L("رقم السند", "Voucher No")}</span>
          <b>
            <bdi>{formatDocNo(v.type, v.number)}</bdi>
          </b>
        </div>
        <div>
          <span>{L("التاريخ", "Date")}</span>
          <bdi>{formatDateTime(v.date)}</bdi>
        </div>
      </div>

      <div className="vch__amount">
        <span>{L("المبلغ", "Amount")}</span>
        <b>
          <bdi>
            {money(v.amount)} {symbol}
          </bdi>
        </b>
      </div>

      <div className="vch__lines">
        <div>
          <span>
            {v.type === "settlement" ? partyLabelSettlement : partyLabel}
          </span>
          <b>{party}</b>
        </div>
        <div className="vch__words">
          <span>{L("مبلغ وقدره", "The sum of")}</span>
          <b>
            {words ?? (
              <>
                {amountInWords(v.amount, "ar", wc)}
                <div dir="ltr">{amountInWords(v.amount, "en", wc)}</div>
              </>
            )}
          </b>
        </div>
        {methodName && (
          <div>
            <span>{L("طريقة الدفع", "Payment method")}</span>
            <b>{methodName}</b>
          </div>
        )}
        {v.reference && (
          <div>
            <span>{L("المرجع", "Reference")}</span>
            <bdi>{v.reference}</bdi>
          </div>
        )}
        {v.notes && (
          <div>
            <span>{L("وذلك عن", "For")}</span>
            <span>{v.notes}</span>
          </div>
        )}
      </div>

      {v.allocations?.length > 0 && (
        <table className="vch__alloc">
          <thead>
            <tr>
              <th>{L("سداد من", "Applied to")}</th>
              <th>{L("المبلغ", "Amount")}</th>
            </tr>
          </thead>
          <tbody>
            {v.allocations.map((a, i) => (
              <tr key={i}>
                <td>
                  <bdi>
                    {a.sale
                      ? saleDocNo("sale", a.sale.number)
                      : a.purchase
                        ? formatDocNo("purchase", a.purchase.number)
                        : L("الرصيد الافتتاحي", "Opening balance")}
                  </bdi>
                </td>
                <td>
                  <bdi>{money(a.amount)}</bdi>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {v.balanceAfter != null && (
        <div className="vch__meta">
          <div>
            <span>{L("الرصيد بعد السند", "Balance after")}</span>
            <b>
              <bdi>{money(Math.abs(v.balanceAfter))}</bdi>{" "}
              {v.balanceAfter < -0.0001
                ? v.customerId
                  ? L("(رصيد للعميل)", "(customer credit)")
                  : L("(رصيد لنا)", "(our credit)")
                : ""}
            </b>
          </div>
        </div>
      )}

      <div className="vch__signatures">
        <div>
          <span>{L("المحاسب", "Accountant")}</span>
          <div className="vch__sign">{user}</div>
        </div>
        <div>
          <span>
            {v.type === "payment"
              ? L("المستلم", "Received by")
              : v.type === "receipt"
                ? L("المسلِّم", "Paid by")
                : partyLabelSettlement}
          </span>
          <div className="vch__sign" />
        </div>
        {isA4 && (
          <div>
            <span>{L("المدير", "Manager")}</span>
            <div className="vch__sign" />
          </div>
        )}
      </div>
    </div>
  );
}
