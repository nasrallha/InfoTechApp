"use client";

import { useTranslations } from "next-intl";
import { useCurrency } from "@/components/common/CurrencyProvider";

// ملخص الإجماليات (للشاشة)
// totals: { subtotal, itemsDiscount, invoiceDiscount, net, tax, total }
// discountLabel: تسمية خصم الفاتورة (المستخلص: استرداد الدفعة المقدمة)
// after: سطور بعد الإجمالي [[التسمية، القيمة، net؟]] (المستخلص: حجز الضمان والصافي المستحق)
export default function TotalsSummary({ totals, taxMode, discountLabel = null, after = [] }) {
  const t = useTranslations("Purchases");
  const { amount: money, symbolNode: symbol } = useCurrency();
  const discount = (totals.itemsDiscount ?? 0) + (totals.invoiceDiscount ?? 0);

  return (
    <div className="pur-totals">
      <div>
        <span>
          {taxMode === "inclusive" ? t("SubtotalIncl") : t("Subtotal")}
        </span>
        <bdi>{money(totals.subtotal)}</bdi>
      </div>
      {totals.itemsDiscount > 0 && (
        <div className="pur-totals__discount">
          <span>{t("ItemsDiscount")}</span>
          <bdi>-{money(totals.itemsDiscount)}</bdi>
        </div>
      )}
      {totals.invoiceDiscount > 0 && (
        <div className="pur-totals__discount">
          <span>{discountLabel ?? t("InvoiceDiscount")}</span>
          <bdi>-{money(totals.invoiceDiscount)}</bdi>
        </div>
      )}
      {discount > 0 && taxMode === "inclusive" && (
        <div className="pur-totals__muted">
          <span>{t("AfterDiscount")}</span>
          <bdi>{money(totals.total)}</bdi>
        </div>
      )}
      <div>
        <span>{t("NetBeforeTax")}</span>
        <bdi>{money(totals.net)}</bdi>
      </div>
      <div>
        <span>{t("VAT")}</span>
        <bdi>{money(totals.tax)}</bdi>
      </div>
      <div className="pur-totals__grand">
        <span>{t("GrandTotal")}</span>
        <bdi>
          {money(totals.total)} {symbol}
        </bdi>
      </div>
      {after.map(([label, value, net]) => (
        <div key={label} className={net ? "pur-totals__grand" : "pur-totals__discount"}>
          <span>{label}</span>
          <bdi>
            {net ? (
              <>
                {money(value)} {symbol}
              </>
            ) : (
              `-${money(value)}`
            )}
          </bdi>
        </div>
      ))}
    </div>
  );
}
