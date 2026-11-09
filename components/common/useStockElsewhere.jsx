"use client";

import { useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { stockElsewhereAction } from "@/actions/inventory.actions";

// ============================================================
// البيع: الصنف رصيده في فرعك مش كفاية ← تنبيه بالفروع / المستودعات اللي فيها
// («متوفر في: مستودع الأحساء (فرع الأحساء) 5 حبة، المستودع الرئيسي 20 حبة»)
// عشان تقول للعميل يروح ياخده منين
// - مرة واحدة لكل صنف في نفس الفاتورة (reset بعد ما الفاتورة تخلص)
// - الخدمات مالهاش رصيد
// ============================================================
export function useStockElsewhere() {
  const t = useTranslations("Sales");
  const locale = useLocale();
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const shown = useRef(new Set());

  // product: صنف البيع (stock = رصيده في فرعك بالوحدة الأساسية)
  // neededBase: الكمية المطلوبة في الفاتورة كلها بالوحدة الأساسية
  const check = async (product, neededBase) => {
    if (!product || product.isService || product.stock == null) return;
    if (neededBase <= Number(product.stock) + 1e-9) return;
    if (shown.current.has(product.id)) return;
    shown.current.add(product.id);
    const res = await stockElsewhereAction(product.id);
    if (!res.success) return;
    const base = nm(product.units?.[0]?.unit ?? {});
    const here = Number(product.stock);
    const title =
      here > 0
        ? t("StockLowHere", { name: nm(product), qty: Number(here.toFixed(3)), unit: base })
        : t("StockNoneHere", { name: nm(product) });
    message.warning({
      duration: 10,
      content: (
        <div style={{ textAlign: "start" }}>
          <b>{title}</b>
          {res.data.length ? (
            <>
              <div style={{ marginTop: 4 }}>{t("StockAvailableAt")}</div>
              <ul style={{ margin: "2px 0 0", paddingInlineStart: 18 }}>
                {res.data.slice(0, 8).map((w) => (
                  <li key={w.warehouseId}>
                    {nm(w)}
                    {w.branches.length > 0 &&
                      ` (${w.branches.map(nm).join("، ")})`}
                    {" — "}
                    <b>
                      {Number(w.qty.toFixed(3))} {base}
                    </b>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div style={{ marginTop: 4 }}>{t("StockNowhere")}</div>
          )}
        </div>
      ),
    });
  };

  // فاتورة جديدة: التنبيه يرجع يظهر للأصناف تاني
  const reset = () => shown.current.clear();

  return { check, reset };
}
