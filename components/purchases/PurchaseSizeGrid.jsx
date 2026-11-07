"use client";

import { useEffect, useState } from "react";
import { Button, Empty, InputNumber, Modal, Space, Spin } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { purchaseModelVariantsAction } from "@/actions/variant.actions";
import "@/components/products/sizePicker.css";
import { ColorDot } from "@/components/products/VariantsFields";
import { C } from "@/lib/theme";

// ============================================================
// فاتورة الشراء: شبكة مقاسات الموديل بالكميات (وحدة variants)
// الصفوف = الألوان (لو موجودة)، والأعمدة = المقاسات، وفي كل خانة الكمية
// سعر شراء واحد للموديل (بيتغير بعدين في أي سطر عادي)
// «إضافة» ← كل مقاس ليه كمية بيبقى سطر في الفاتورة (بالوحدة الأساسية)
// defaultCost(unit, product): سعر الشراء الافتراضي (آخر تكلفة حسب نوع الضريبة)
// ============================================================
export default function PurchaseSizeGrid({
  modelId,
  defaultCost,
  onAdd,
  onClose,
}) {
  const t = useTranslations("Variants");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [data, setData] = useState({ key: null, value: null });
  const [qty, setQty] = useState({});
  const [cost, setCost] = useState(null);
  const [fill, setFill] = useState(null);

  useEffect(() => {
    let alive = true;
    purchaseModelVariantsAction(modelId).then((res) => {
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
  const colors = [...new Set(variants.map((v) => v.color ?? ""))];
  const find = (size, color) =>
    variants.find((v) => (v.size ?? "—") === size && (v.color ?? "") === color);
  // السعر الافتراضي: تكلفة أول مقاس (لحد ما المستخدم يكتب سعر)
  const first = variants[0];
  const shownCost = cost ?? (first ? defaultCost(first.units[0], first) : null);
  const chosen = variants.filter((v) => qty[v.id] > 0);
  const totalQty = chosen.reduce((s, v) => s + qty[v.id], 0);

  const fillAll = () =>
    setQty(Object.fromEntries(variants.map((v) => [v.id, fill || 0])));

  const add = () => {
    for (const v of chosen)
      onAdd(v, v.units[0].unit.id, { qty: qty[v.id], price: shownCost ?? 0 });
    message.success(t("GridAdded", { n: chosen.length }));
    onClose();
  };

  return (
    <Modal
      open
      onCancel={onClose}
      width={Math.min(180 + sizes.length * 84, 980)}
      title={`${t("GridTitle")} · ${nm(data.value?.model)}`}
      destroyOnHidden
      footer={
        <Space wrap>
          <span style={{ color: C.muted }}>
            {t("GridTotal", { n: totalQty })}
          </span>
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!chosen.length}
            onClick={add}
          >
            {t("GridAdd", { n: chosen.length })}
          </Button>
        </Space>
      }
    >
      <Spin spinning={loading}>
        {!variants.length ? (
          !loading && <Empty description={t("NoVariants")} />
        ) : (
          <>
            <Space wrap className="mb-3">
              <span>{t("GridCost")}</span>
              <InputNumber
                min={0}
                value={shownCost}
                onChange={(v) => setCost(v ?? 0)}
                style={{ width: 130 }}
              />
              <span style={{ marginInlineStart: 12 }}>{t("GridFill")}</span>
              <InputNumber
                min={0}
                precision={3}
                value={fill}
                onChange={setFill}
                style={{ width: 90 }}
              />
              <Button disabled={fill == null} onClick={fillAll}>
                {t("Apply")}
              </Button>
            </Space>
            <div className="size-grid">
              <div className="size-grid__row size-grid__head">
                {colors.some(Boolean) && <div className="size-grid__color" />}
                {sizes.map((s) => (
                  <div key={s} className="size-grid__label">
                    {s}
                  </div>
                ))}
              </div>
              {colors.map((color) => (
                <div key={color} className="size-grid__row">
                  {colors.some(Boolean) && (
                    <div className="size-grid__color">
                      <ColorDot
                        name={color}
                        hex={variants.find((v) => v.color === color)?.colorHex}
                      />{" "}
                      {color}
                    </div>
                  )}
                  {sizes.map((size) => {
                    const v = find(size, color);
                    if (!v)
                      return <div key={size} className="size-grid__label" />;
                    return (
                      <InputNumber
                        key={size}
                        className="size-grid__qty"
                        min={0}
                        precision={3}
                        controls={false}
                        value={qty[v.id] ?? null}
                        placeholder="0"
                        onChange={(x) =>
                          setQty((prev) => ({ ...prev, [v.id]: x ?? 0 }))
                        }
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </Spin>
    </Modal>
  );
}
