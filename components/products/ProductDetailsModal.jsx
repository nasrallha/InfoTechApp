"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Descriptions,
  Divider,
  Image,
  Modal,
  Skeleton,
  Table,
  Tag,
} from "antd";
import {
  BarcodeOutlined,
  HistoryOutlined,
  PictureOutlined,
} from "@ant-design/icons";
import { AiTwotoneEdit } from "react-icons/ai";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { imageUrl } from "@/lib/image";
import { formatDateTime } from "@/lib/dates";
import { getProductDetailsAction } from "@/actions/product.actions";
import { useCan } from "@/components/auth/AuthProvider";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { message } from "@/components/common/feedback";
import { StatusBadge } from "@/components/common/tableFilters";
import UnitBreakdown from "@/components/inventory/UnitBreakdown";
import ItemCard from "@/components/inventory/ItemCard";
import "@/components/common/table.css";

const q3 = (v) => Number(Number(v ?? 0).toFixed(3));

// ============================================================
// كارت الصنف: كل بيانات الصنف في نافذة (بدون فتح شاشة التعديل)
// الصورة، الاسمين، الكود والباركودات، الأسعار، الوحدات ومعاملاتها،
// الرصيد الافتتاحي، والرصيد الحالي في كل مستودع (بالكرتونة والشدة والحبة)
// productId: الصنف المعروض (null = النافذة مقفولة)
// ============================================================
export default function ProductDetailsModal({ productId, onClose }) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [movements, setMovements] = useState(null);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("ProductCard");
  const tTable = useTranslations("Table");
  const tForm = useTranslations("Form");
  const tButtons = useTranslations("Buttons");
  const tAlerts = useTranslations("Alerts");
  const { amount: money } = useCurrency();
  const can = useCan();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  useEffect(() => {
    if (!productId) return;
    let active = true;
    setLoading(true);
    setProduct(null);
    getProductDetailsAction(productId).then((res) => {
      if (!active) return;
      setLoading(false);
      if (!res.success) {
        message.error(tAlerts(res.error));
        onClose?.();
        return;
      }
      setProduct(res.data);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const p = product;
  const base = p ? nameOf(p.baseUnit) : "";

  // الوحدة الأساسية + الوحدات الإضافية في جدول واحد
  const unitRows = p
    ? [
        {
          key: "base",
          unit: p.baseUnit,
          isBase: true,
          factor: 1,
          barcode: p.code,
          cost: p.cost,
          price: p.price,
          startStock: p.startStock,
        },
        ...p.productUnits.map((u) => ({
          key: u.id,
          unit: u.unit,
          factor: u.conversionFactor,
          barcode: u.barcode,
          cost: u.cost,
          price: u.price,
          startStock: u.startStock,
        })),
      ]
    : [];

  const unitColumns = [
    {
      title: tForm("Unit"),
      key: "unit",
      width: 140,
      render: (_, r) => (
        <span>
          <b>{nameOf(r.unit)}</b>{" "}
          {r.isBase && <Tag color="geekblue">{t("Base")}</Tag>}
        </span>
      ),
    },
    {
      title: t("Contains"),
      key: "factor",
      width: 120,
      render: (_, r) =>
        r.isBase ? (
          "—"
        ) : (
          <span>
            {q3(r.factor)} {base}
          </span>
        ),
    },
    {
      title: t("Barcode"),
      key: "barcode",
      width: 170,
      render: (_, r) =>
        r.barcode ? (
          <span>
            <BarcodeOutlined /> <bdi>{r.barcode}</bdi>
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      title: tTable("Cost"),
      key: "cost",
      width: 110,
      render: (_, r) => money(r.cost),
    },
    {
      title: tTable("Price"),
      key: "price",
      width: 110,
      render: (_, r) => <b>{money(r.price)}</b>,
    },
    {
      title: tForm("StartStock"),
      key: "start",
      width: 110,
      render: (_, r) => (r.startStock ? q3(r.startStock) : "—"),
    },
  ];

  const multiWarehouse = (p?.byWarehouse.length ?? 0) > 1;

  return (
    <>
      <Modal
        open={Boolean(productId)}
        onCancel={onClose}
        width={900}
        centered
        destroyOnHidden
        title={t("Title")}
        footer={
          p && (
            <div className="flex flex-wrap justify-end gap-2">
              {can("stock.view") && (
                <Button
                  icon={<HistoryOutlined />}
                  onClick={() => setMovements(p)}
                >
                  {t("Movements")}
                </Button>
              )}
              {can("products.update") && (
                <Button
                  type="primary"
                  icon={<AiTwotoneEdit />}
                  onClick={() => router.push(`/products/${p.id}/edit`)}
                >
                  {tButtons("Edit")}
                </Button>
              )}
              <Button onClick={onClose}>{t("Close")}</Button>
            </div>
          )
        }
      >
        {loading || !p ? (
          <Skeleton active avatar paragraph={{ rows: 8 }} />
        ) : (
          <div>
            {/* ============ الصورة والأسماء ============ */}
            <div className="flex flex-wrap gap-5 items-start">
              <div
                style={{
                  width: 150,
                  height: 150,
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "#f8fafc",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {p.image ? (
                  <Image
                    src={imageUrl(p.image)}
                    alt=""
                    width={150}
                    height={150}
                    style={{ objectFit: "contain" }}
                  />
                ) : (
                  <div className="text-center text-gray-400">
                    <PictureOutlined style={{ fontSize: 40 }} />
                    <div style={{ fontSize: 12 }}>{t("NoImage")}</div>
                  </div>
                )}
              </div>

              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <div className="text-xl font-bold">{p.arName}</div>
                <div
                  className="text-gray-500 mb-2"
                  dir="ltr"
                  style={{ textAlign: "start" }}
                >
                  {p.enName}
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Tag icon={<BarcodeOutlined />} color="#2c3e50">
                    <bdi>{p.code}</bdi>
                  </Tag>
                  <StatusBadge active={p.isActive} tForm={tForm} />
                </div>

                {/* الرصيد الحالي */}
                <div
                  style={{
                    background: p.stock < 0 ? "#fef2f2" : "#ecfdf5",
                    border: `1px solid ${p.stock < 0 ? "#fecaca" : "#a7f3d0"}`,
                    borderRadius: 10,
                    padding: "10px 14px",
                  }}
                >
                  <div className="text-gray-500" style={{ fontSize: 13 }}>
                    {multiWarehouse ? t("TotalStock") : t("CurrentStock")}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <b
                      style={{ fontSize: 22 }}
                      className={
                        p.stock < 0 ? "text-red-600" : "text-green-700"
                      }
                    >
                      {q3(p.stock)}
                    </b>
                    <span>{base}</span>
                    <UnitBreakdown qty={p.stock} units={p.units} />
                  </div>
                </div>
              </div>
            </div>

            {/* ============ الرصيد في كل مستودع ============ */}
            {multiWarehouse && (
              <>
                <Divider titlePlacement="start">{t("ByWarehouse")}</Divider>
                <Table
                  bordered
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={p.byWarehouse}
                  columns={[
                    {
                      title: t("Warehouse"),
                      key: "w",
                      render: (_, w) => (
                        <span>
                          {nameOf(w)}{" "}
                          {w.isMain && <Tag color="gold">{t("Main")}</Tag>}
                        </span>
                      ),
                    },
                    {
                      title: t("Qty"),
                      key: "q",
                      width: 120,
                      render: (_, w) => (
                        <b className={w.qty < 0 ? "text-red-600" : undefined}>
                          {q3(w.qty)} {base}
                        </b>
                      ),
                    },
                    {
                      title: t("ByUnits"),
                      key: "u",
                      render: (_, w) => (
                        <UnitBreakdown qty={w.qty} units={p.units} />
                      ),
                    },
                  ]}
                />
              </>
            )}

            {/* ============ البيانات ============ */}
            <Divider titlePlacement="start">{t("Details")}</Divider>
            <Descriptions
              size="small"
              bordered
              column={{ xs: 1, sm: 2, md: 3 }}
              items={[
                {
                  key: "cat",
                  label: tTable("Category"),
                  children: p.category?.parent
                    ? `${nameOf(p.category.parent)} / ${nameOf(p.category)}`
                    : nameOf(p.category),
                },
                { key: "base", label: tTable("BaseUnit"), children: base },
                {
                  key: "tax",
                  label: tTable("TaxRate"),
                  children: (
                    <span>
                      {p.taxRate}%{" "}
                      <Tag color={p.isPriceIncludeTax ? "geekblue" : "default"}>
                        {p.isPriceIncludeTax ? t("InclTax") : t("ExclTax")}
                      </Tag>
                      {!(p.taxRate > 0) && p.taxCategory && (
                        <Tag color="orange">
                          {tForm(`taxCategory.${p.taxCategory}`)}
                          {p.taxExemptionCode ? ` — ${p.taxExemptionCode}` : ""}
                        </Tag>
                      )}
                    </span>
                  ),
                },
                { key: "cost", label: tTable("Cost"), children: money(p.cost) },
                {
                  key: "price",
                  label: tTable("Price"),
                  children: <b>{money(p.price)}</b>,
                },
                {
                  key: "ws",
                  label: tTable("WholesalePrice"),
                  children: money(p.wholesalePrice),
                },
                {
                  key: "open",
                  label: tForm("StartStock"),
                  children: (
                    <span>
                      {q3(p.openingTotal)} {base}{" "}
                      <UnitBreakdown qty={p.openingTotal} units={p.units} />
                    </span>
                  ),
                },
                {
                  key: "created",
                  label: t("CreatedAt"),
                  children: <bdi>{formatDateTime(p.createdAt)}</bdi>,
                },
                {
                  key: "updated",
                  label: t("UpdatedAt"),
                  children: <bdi>{formatDateTime(p.updatedAt)}</bdi>,
                },
              ]}
            />

            {/* ============ الوحدات والباركودات والأسعار ============ */}
            <Divider titlePlacement="start">{t("UnitsAndBarcodes")}</Divider>
            <Table
              bordered
              size="small"
              rowKey="key"
              pagination={false}
              tableLayout="fixed"
              scroll={{ x: 760 }}
              columns={unitColumns}
              dataSource={unitRows}
            />
          </div>
        )}
      </Modal>

      {/* حركات الصنف (من نافذة الصنف) */}
      <ItemCard product={movements} onClose={() => setMovements(null)} />
    </>
  );
}
