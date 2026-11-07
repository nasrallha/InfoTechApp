"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Col,
  ColorPicker,
  Form,
  Input,
  InputNumber,
  Popover,
  Row,
  Select,
  Space,
  Tooltip,
} from "antd";
import { CheckOutlined, PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { PRESET_COLORS, colorFill, isHex, isLight } from "@/lib/variant-colors";
import { variantColorsAction } from "@/actions/variant.actions";
import "./sizePicker.css";

// مقاسات جاهزة (بتتضاف للقائمة وتتعدل عادي)
export const SIZE_PRESETS = {
  Shoes: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"],
  Clothes: ["XS", "S", "M", "L", "XL", "XXL", "3XL"],
  Pants: ["28", "30", "32", "34", "36", "38", "40", "42", "44"],
  Kids: ["2", "4", "6", "8", "10", "12", "14"],
};

export const comboKey = (size, color) => `${size ?? ""}|${color ?? ""}`;

// دايرة اللون (الكاشير والجداول والسلة)
// خلفية وحدود الدايرة: اللون المحفوظ، وإلا من اسم اللون
// (اسم فيه كذا لون ← دايرة مقسومة بالألوان، ومش معروف ← رمادي فاتح)
export function swatchStyle(name, hex) {
  const fill = colorFill(name, hex);
  return {
    background: fill ?? "#e2e8f0",
    borderColor: isHex(fill) && !isLight(fill) ? fill : "#cbd5e1",
  };
}

// name: اسم اللون (لو مفيش hex محفوظ، اللون بيتعرف من الاسم)
export function ColorDot({ hex, name, size = 14, title, style }) {
  if (!colorFill(name, hex)) return null;
  return (
    <span
      title={title ?? name}
      className="color-dot"
      style={{ width: size, height: size, ...swatchStyle(name, hex), ...style }}
    />
  );
}

// ============================================================
// لوحة الألوان (دواير): اللوحة الجاهزة + ألوان التاجر + «لون آخر»
// value: [{ name, hex }] المختارة
// ============================================================
export function ColorPalette({ value = [], onChange }) {
  const t = useTranslations("Variants");
  const locale = useLocale();
  const [saved, setSaved] = useState([]);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState({ name: "", hex: "#64748b" });

  useEffect(() => {
    let alive = true;
    variantColorsAction().then((res) => {
      if (alive && res.success) setSaved(res.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  const palette = [
    ...PRESET_COLORS.map((c) => ({
      name: locale === "ar" ? c.ar : c.en,
      hex: c.hex,
    })),
    ...saved.map((c) => ({ name: c.arName, hex: c.hex })),
    // ألوان مختارة مش في اللوحة (لون آخر لسه متحفظش)
    ...value.filter(
      (v) =>
        !PRESET_COLORS.some((c) => c.ar === v.name || c.en === v.name) &&
        !saved.some((c) => c.arName === v.name),
    ),
  ];
  const picked = new Set(value.map((v) => v.name));
  const toggle = (c) =>
    onChange(
      picked.has(c.name)
        ? value.filter((v) => v.name !== c.name)
        : [...value, c],
    );

  const addCustom = () => {
    const name = custom.name.trim();
    if (!name || picked.has(name)) return;
    onChange([...value, { name, hex: custom.hex }]);
    setCustom({ name: "", hex: custom.hex });
    setOpen(false);
  };

  return (
    <div className="color-palette">
      {palette.map((c) => (
        <Tooltip key={c.name} title={c.name}>
          <button
            type="button"
            className={`color-swatch ${picked.has(c.name) ? "is-on" : ""}`}
            style={{
              ...swatchStyle(c.name, c.hex),
              color: isLight(c.hex) ? "#111827" : "#fff",
            }}
            onClick={() => toggle(c)}
          >
            {picked.has(c.name) && <CheckOutlined />}
          </button>
        </Tooltip>
      ))}
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        title={t("OtherColor")}
        content={
          <Space.Compact>
            <ColorPicker
              value={custom.hex}
              disabledAlpha
              onChange={(c) =>
                setCustom((x) => ({ ...x, hex: c.toHexString() }))
              }
            />
            <Input
              value={custom.name}
              placeholder={t("ColorName")}
              maxLength={30}
              style={{ width: 140 }}
              onChange={(e) =>
                setCustom((x) => ({ ...x, name: e.target.value }))
              }
              onPressEnter={addCustom}
            />
            <Button type="primary" onClick={addCustom}>
              {t("AddColor")}
            </Button>
          </Space.Compact>
        }
      >
        <Tooltip title={t("OtherColor")}>
          <button type="button" className="color-swatch color-swatch--add">
            <PlusOutlined />
          </button>
        </Tooltip>
      </Popover>
      {value.length > 0 && (
        <div className="color-palette__picked">
          {value.map((c) => (
            <span key={c.name} className="color-chip">
              <ColorDot hex={c.hex} name={c.name} size={12} /> {c.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// حقول المقاسات: المقاسات + الألوان (دواير) + الرصيد الافتتاحي لكل مقاس
// value: { sizes: [], colors: [{name,hex}], opening: { "مقاس|لون": كمية } }
// taken: المقاسات الموجودة في الموديل (مش بتتكرر ومالهاش رصيد هنا)
// ============================================================
export default function VariantsFields({ value, onChange, taken = new Set() }) {
  const t = useTranslations("Variants");
  const { sizes, colors, opening } = value;
  const set = (patch) => onChange({ ...value, ...patch });
  const colorRows = colors.length ? colors : [null];
  const fresh = (size, c) => !taken.has(comboKey(size, c?.name));

  const addPreset = (key) =>
    set({ sizes: [...new Set([...sizes, ...SIZE_PRESETS[key]])] });

  return (
    <>
      <Row gutter={12}>
        <Col xs={24} lg={12}>
          <Form.Item
            label={t("Sizes")}
            tooltip={t("SizesHint")}
            layout="vertical"
            className="mb-2"
          >
            <Select
              mode="tags"
              value={sizes}
              onChange={(v) => set({ sizes: v })}
              tokenSeparators={[",", "،", " "]}
              placeholder={t("SizesPlaceholder")}
              open={false}
              suffixIcon={null}
            />
          </Form.Item>
          <Space size={4} wrap className="mb-2">
            {Object.keys(SIZE_PRESETS).map((k) => (
              <Button key={k} size="small" onClick={() => addPreset(k)}>
                {t(`Preset_${k}`)}
              </Button>
            ))}
          </Space>
        </Col>
        <Col xs={24} lg={12}>
          <Form.Item
            label={t("Colors")}
            tooltip={t("ColorsHint")}
            layout="vertical"
            className="mb-2"
          >
            <ColorPalette value={colors} onChange={(v) => set({ colors: v })} />
          </Form.Item>
        </Col>
      </Row>

      {/* الرصيد الافتتاحي لكل مقاس (ولون) */}
      {sizes.length > 0 && (
        <div className="mt-2">
          <div className="mb-2" style={{ fontWeight: 600 }}>
            {t("OpeningGrid")}{" "}
            <span style={{ color: "#94a3b8", fontWeight: 400, fontSize: 12 }}>
              {t("OpeningGridHint")}
            </span>
          </div>
          <div className="size-grid">
            <div className="size-grid__row">
              {colors.length > 0 && <div className="size-grid__color" />}
              {sizes.map((s) => (
                <div key={s} className="size-grid__label">
                  {s}
                </div>
              ))}
            </div>
            {colorRows.map((c) => (
              <div key={c?.name ?? "-"} className="size-grid__row">
                {colors.length > 0 && (
                  <div className="size-grid__color">
                    <ColorDot hex={c.hex} name={c.name} /> {c.name}
                  </div>
                )}
                {sizes.map((s) => {
                  const k = comboKey(s, c?.name);
                  return fresh(s, c) ? (
                    <InputNumber
                      key={s}
                      className="size-grid__qty"
                      min={0}
                      precision={3}
                      controls={false}
                      placeholder="0"
                      value={opening[k] ?? null}
                      onChange={(x) =>
                        set({ opening: { ...opening, [k]: x ?? 0 } })
                      }
                    />
                  ) : (
                    <Tooltip key={s} title={t("AlreadyExists")}>
                      <div className="size-grid__label size-grid__taken">✓</div>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// عدد المقاسات الجديدة (اللي هتتعمل)
export function newCombos({ sizes, colors }, taken = new Set()) {
  return sizes
    .flatMap((s) =>
      (colors.length ? colors : [null]).map((c) => comboKey(s, c?.name)),
    )
    .filter((k) => !taken.has(k)).length;
}

// القيمة الفاضية
export const EMPTY_VARIANTS = { sizes: [], colors: [], opening: {} };

// للإرسال: الرصيد للمقاسات الجديدة بس
export const variantsPayload = (v) => ({
  sizes: v.sizes,
  colors: v.colors.map((c) => ({ name: c.name, hex: c.hex ?? null })),
  opening: Object.fromEntries(
    Object.entries(v.opening).filter(([, q]) => Number(q) > 0),
  ),
});

// ============================================================
// كارت الصنف: ألوان الموديل دواير (اللون الحالي عليه حلقة)
// ومقاسات اللون الحالي برصيد كل مقاس (المقاس الحالي متعلّم)
// ============================================================
export function VariantSwatches({ product }) {
  const t = useTranslations("Variants");
  const variants = product.variants ?? [];
  const colors = [
    ...new Map(
      variants
        .filter((v) => v.color)
        .map((v) => [v.color, { name: v.color, hex: v.colorHex }]),
    ).values(),
  ];
  const sizes = variants.filter(
    (v) => (v.color ?? "") === (product.color ?? ""),
  );
  const colorStock = (name) =>
    variants
      .filter((v) => v.color === name)
      .reduce((s, v) => s + (v.stock ?? 0), 0);

  return (
    <div className="variant-swatches mb-3">
      {colors.length > 0 && (
        <div className="variant-swatches__row">
          <span className="variant-swatches__label">{t("Color")}:</span>
          {colors.map((c) => (
            <Tooltip
              key={c.name}
              title={`${c.name} · ${t("Stock")}: ${colorStock(c.name)}`}
            >
              <span
                className={`color-swatch ${c.name === product.color ? "is-on" : ""}`}
                style={{
                  ...swatchStyle(c.name, c.hex),
                  cursor: "default",
                  opacity: colorStock(c.name) > 0 ? 1 : 0.45,
                }}
              />
            </Tooltip>
          ))}
          {product.color && (
            <span style={{ color: "#475569", fontWeight: 600 }}>
              {product.color}
            </span>
          )}
        </div>
      )}
      <div className="variant-swatches__row">
        <span className="variant-swatches__label">{t("Size")}:</span>
        {sizes.map((v) => (
          <span
            key={v.id}
            className={`size-chip ${v.id === product.id ? "is-on" : ""} ${
              v.stock > 0 ? "" : "is-out"
            }`}
          >
            <b>{v.size ?? "—"}</b>
            <small>{v.stock}</small>
          </span>
        ))}
      </div>
    </div>
  );
}
