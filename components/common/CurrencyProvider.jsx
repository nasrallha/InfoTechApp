"use client";
import { createContext, useContext } from "react";
import { useLocale } from "next-intl";
import RiyalSymbol from "./RiyalSymbol";

// العملة الأساسية متاحة لكل مكونات الواجهة (الملصقات، الفواتير، التقارير ...)
const CurrencyContext = createContext(null);

export function CurrencyProvider({ currency, children }) {
  return <CurrencyContext value={currency}>{children}</CurrencyContext>;
}

// العملة الأساسية + أدوات مساعدة:
//   const { symbol, decimals, format } = useCurrency();
//   format(15) ← "15.00 ر.س"
export function useCurrency() {
  const currency = useContext(CurrencyContext);
  const locale = useLocale();

  const decimals = currency?.decimals ?? 2;
  const symbol = currency
    ? locale === "ar"
      ? currency.arSymbol
      : currency.enSymbol
    : locale === "ar"
      ? "ر.س"
      : "SAR";

  const code = currency?.code ?? "SAR";
  // للعرض في الواجهة والفواتير (JSX): الريال السعودي بالرمز الرسمي، وغيره بالنص
  // (النصوص العادية والتصدير Excel بتستخدم symbol النصي)
  const symbolNode = code === "SAR" ? <RiyalSymbol /> : symbol;

  const amount = (value) => Number(value ?? 0).toFixed(decimals);
  const format = (value) => `${amount(value)} ${symbol}`;

  return {
    currency,
    code,
    symbol,
    symbolNode,
    decimals,
    amount,
    format,
  };
}
