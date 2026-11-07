"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  InputNumber,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
} from "antd";
import { ColumnHeightOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { qtyText } from "@/lib/unit-qty";
import VariantsFields, {
  ColorDot,
  EMPTY_VARIANTS,
  newCombos,
  variantsPayload,
} from "./VariantsFields";
import {
  generateVariantsAction,
  getProductVariantsAction,
  setModelPriceAction,
} from "@/actions/variant.actions";
import { C } from "@/lib/theme";

// ============================================================
// المقاسات والألوان (وحدة variants) من شاشة الأصناف
// - توليد: المقاسات (إجباري) × الألوان (اختياري) ← كل واحد صنف بكود ورصيد
//   الصنف نفسه بياخد أول مقاس، والتوليد تاني بيضيف الجديد بس
// - الموجود: المقاس واللون والكود والسعر والرصيد
// - سعر واحد لكل المقاسات
// ============================================================
export default function VariantsModal({ productId, onClose }) {
  const t = useTranslations("Variants");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const can = useCan();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [data, setData] = useState({ key: null, value: null });
  const [reload, setReload] = useState(0);
  // المقاسات + الألوان + الرصيد الافتتاحي لكل مقاس
  const [vf, setVf] = useState(EMPTY_VARIANTS);
  const [saving, setSaving] = useState(false);
  const [price, setPrice] = useState(null);
  const [pricing, setPricing] = useState(false);

  const loadKey = `${productId}|${reload}`;
  useEffect(() => {
    let alive = true;
    getProductVariantsAction(productId).then((res) => {
      if (!alive) return;
      if (!res.success) showActionError(res, tAlerts, locale);
      setData({ key: loadKey, value: res.success ? res.data : null });
    });
    return () => {
      alive = false;
    };
  }, [productId, loadKey, tAlerts, locale]);

  const loading = data.key !== loadKey;
  const info = data.value;
  const variants = info?.variants ?? [];
  const taken = new Set(
    variants.map((v) => `${v.size ?? ""}|${v.color ?? ""}`),
  );
  const newCount = newCombos(vf, taken);

  const generate = async () => {
    setSaving(true);
    const res = await generateVariantsAction({
      productId,
      ...variantsPayload(vf),
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Generated", { n: res.data.created }));
    setVf(EMPTY_VARIANTS);
    setReload((n) => n + 1);
  };

  const applyPrice = async () => {
    setPricing(true);
    const res = await setModelPriceAction({
      modelId: info.model.id,
      price: Number(price) || 0,
    });
    setPricing(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("PriceApplied", { n: res.data.updated }));
    setPrice(null);
    setReload((n) => n + 1);
  };

  const hasColors = variants.some((v) => v.color);
  const columns = [
    { title: t("Size"), dataIndex: "size", width: 80, align: "center" },
    ...(hasColors
      ? [
          {
            title: t("Color"),
            dataIndex: "color",
            width: 120,
            render: (v, r) => (
              <Space size={6}>
                <ColorDot hex={r.colorHex} name={v} />
                {v}
              </Space>
            ),
          },
        ]
      : []),
    {
      title: t("Code"),
      dataIndex: "code",
      render: (v) => <bdi>{v}</bdi>,
    },
    {
      title: t("Price"),
      dataIndex: "price",
      align: "end",
      render: (v) => money(v),
    },
    {
      title: t("Stock"),
      dataIndex: "stock",
      align: "center",
      width: 80,
      render: (v) => (
        <Tag color={v > 0 ? "green" : v < 0 ? "red" : "default"}>
          {qtyText(v)}
        </Tag>
      ),
    },
  ];

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      width={860}
      destroyOnHidden
      title={
        <Space>
          <ColumnHeightOutlined />
          {t("Title")}
          {info && <span>· {nm(info.model ?? info.product)}</span>}
        </Space>
      }
    >
      <Spin spinning={loading}>
        {info?.product?.isService ? (
          <Alert type="warning" showIcon title={t("NotForService")} />
        ) : (
          <>
            {can("products.create") && (
              <div
                style={{
                  background: C.bgSubtle,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <VariantsFields value={vf} onChange={setVf} taken={taken} />
                <Space wrap>
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    disabled={!newCount}
                    loading={saving}
                    onClick={generate}
                  >
                    {t("Generate", { n: newCount })}
                  </Button>
                  <span style={{ color: C.muted, fontSize: 12 }}>
                    {variants.length ? t("AddMoreHint") : t("FirstHint")}
                  </span>
                </Space>
              </div>
            )}

            {variants.length ? (
              <>
                {can("products.update") && (
                  <Space className="mb-2 mt-3" wrap>
                    <span>{t("PriceAll")}</span>
                    <InputNumber
                      min={0}
                      value={price}
                      onChange={setPrice}
                      style={{ width: 140 }}
                    />
                    <Button
                      disabled={price == null}
                      loading={pricing}
                      onClick={applyPrice}
                    >
                      {t("Apply")}
                    </Button>
                  </Space>
                )}
                <Table
                  size="small"
                  rowKey="id"
                  className="mt-2"
                  columns={columns}
                  dataSource={variants}
                  pagination={false}
                  scroll={{ y: 320 }}
                  rowClassName={(r) => (r.isActive ? "" : "row-muted")}
                />
              </>
            ) : (
              !loading && (
                <Empty className="mt-3" description={t("NoVariants")} />
              )
            )}
          </>
        )}
      </Spin>
    </Modal>
  );
}
