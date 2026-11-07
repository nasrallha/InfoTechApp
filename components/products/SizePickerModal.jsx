"use client";

import { useEffect, useState } from "react";
import { Button, Empty, Modal, Spin } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { qtyText } from "@/lib/unit-qty";
import { swatchStyle } from "./VariantsFields";
import { saleModelVariantsAction } from "@/actions/variant.actions";
import { C } from "@/lib/theme";
import "./sizePicker.css";

// ============================================================
// الكاشير / فاتورة البيع: شبكة مقاسات الموديل (وحدة variants)
// الألوان دواير فوق ← تختار اللون فتظهر مقاساته بس، وفي كل مقاس الرصيد
// الضغط على المقاس ← onPick(صنف المقاس)، والأب بيقفل النافذة
// ============================================================
export default function SizePickerModal({ modelId, onPick, onClose }) {
  const t = useTranslations("Variants");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [data, setData] = useState({ key: null, value: null });
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    let alive = true;
    saleModelVariantsAction(modelId).then((res) => {
      if (!alive) return;
      if (!res.success) showActionError(res, tAlerts, locale);
      setData({ key: modelId, value: res.success ? res.data : null });
    });
    return () => {
      alive = false;
    };
  }, [modelId, tAlerts, locale]);

  const loading = data.key !== modelId;
  const variants = data.value?.variants ?? [];
  const sizes = [...new Set(variants.map((v) => v.size ?? "—"))];
  // الألوان (دواير): اللون ← مقاساته بس
  const colors = [
    ...new Map(
      variants
        .filter((v) => v.color)
        .map((v) => [v.color, { name: v.color, hex: v.colorHex }]),
    ).values(),
  ];
  const stockOf = (v) => (v.isService ? null : v.stock);
  // اللون المختار: اختيار الكاشير، وإلا أول لون فيه رصيد
  const firstInStock =
    colors.find((c) =>
      variants.some((v) => v.color === c.name && stockOf(v) > 0),
    ) ?? colors[0];
  const color = colors.find((c) => c.name === picked) ?? firstInStock;
  const shown = colors.length
    ? variants.filter((v) => v.color === color?.name)
    : variants;
  // سعر واحد لكل المقاسات ← في العنوان، مختلف ← تحت كل مقاس
  const prices = new Set(variants.map((v) => v.units[0].price));
  const onePrice = prices.size === 1 ? [...prices][0] : null;
  const colorStock = (c) =>
    variants
      .filter((v) => v.color === c.name)
      .reduce((s, v) => s + (stockOf(v) ?? 0), 0);

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      width={Math.min(Math.max(140 + sizes.length * 84, 420), 900)}
      title={
        <span>
          {t("PickSize")} · {nm(data.value?.model)}
          {onePrice != null && (
            <bdi style={{ marginInlineStart: 8, color: C.success }}>
              {money(onePrice)}
            </bdi>
          )}
        </span>
      }
      destroyOnHidden
    >
      <Spin spinning={loading}>
        {!variants.length ? (
          !loading && <Empty description={t("NoVariants")} />
        ) : (
          <>
            {colors.length > 0 && (
              <div className="size-colors">
                {colors.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    className={`size-color ${c.name === color?.name ? "is-on" : ""}`}
                    onClick={() => setPicked(c.name)}
                  >
                    <span
                      className={`color-swatch ${c.name === color?.name ? "is-on" : ""}`}
                      style={{
                        ...swatchStyle(c.name, c.hex),
                        opacity: colorStock(c) > 0 ? 1 : 0.45,
                      }}
                    />
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <div className="size-sizes">
              {shown.map((v) => {
                const stock = stockOf(v);
                return (
                  <Button
                    key={v.id}
                    className={`size-grid__cell ${
                      stock != null && stock <= 0 ? "is-out" : ""
                    }`}
                    onClick={() => onPick(v)}
                  >
                    <b>{v.size ?? "—"}</b>
                    {stock != null && <small>{qtyText(stock)}</small>}
                    {onePrice == null && (
                      <small className="size-grid__price">
                        {money(v.units[0].price)}
                      </small>
                    )}
                  </Button>
                );
              })}
            </div>
          </>
        )}
      </Spin>
    </Modal>
  );
}
