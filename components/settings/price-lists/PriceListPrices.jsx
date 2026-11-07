"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  InputNumber,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { message } from "@/components/common/feedback";
import {
  ArrowRightOutlined,
  SaveOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import {
  getPriceListProductsAction,
  savePriceListPricesAction,
} from "@/actions/price-list.actions";
import { useCurrency } from "@/components/common/CurrencyProvider";
import SearchBox from "@/components/common/SearchBox";
import { C } from "@/lib/theme";
import "@/components/common/table.css";

const keyOf = (productId, unitId) => `${productId}:${unitId}`;

// ============================================================
// أسعار قائمة: كل صنف بوحداته، السعر الأساسي، وسعره في القائمة
// - الخانة فاضية = الصنف يُباع بسعره الأساسي في فروع هذه القائمة
// - التعديلات تتجمع (حتى مع تغيير الصفحة أو البحث) ثم "حفظ التغييرات"
// ============================================================
export default function PriceListPrices({
  priceList,
  categories = [],
  canEdit,
}) {
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState();
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, pageSize: 30 });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // التعديلات غير المحفوظة: { "productId:unitId": price | null }
  const [edits, setEdits] = useState({});
  const requestId = useRef(0);
  const [reload, setReload] = useState(0);

  const locale = useLocale();
  const t = useTranslations("PriceLists");
  const tAlerts = useTranslations("Alerts");
  const { amount: money, decimals } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await getPriceListProductsAction({
        priceListId: priceList.id,
        q,
        categoryId,
        page,
      });
      if (id !== requestId.current) return;
      setLoading(false);
      if (!res.success) return message.error(tAlerts(res.error));
      setData(res.data);
    }, 250);
    return () => clearTimeout(timer);
  }, [priceList.id, q, categoryId, page, reload, tAlerts]);

  // صف لكل (صنف، وحدة)، واسم الصنف يمتد على وحداته
  const rows = data.rows.flatMap((p) =>
    p.units.map((u, i) => ({
      key: keyOf(p.id, u.unit.id),
      product: p,
      unit: u.unit,
      basePrice: u.basePrice,
      savedPrice: u.listPrice,
      span: i === 0 ? p.units.length : 0,
    })),
  );

  const priceOf = (r) => (r.key in edits ? edits[r.key] : r.savedPrice);
  const changedCount = Object.keys(edits).length;

  const setPrice = (r, value) =>
    setEdits((prev) => {
      const next = { ...prev };
      const v = value == null || value === "" ? null : Number(value);
      // رجع لنفس القيمة المحفوظة ← مش تعديل
      if (v === r.savedPrice) delete next[r.key];
      else next[r.key] = v;
      return next;
    });

  const save = async () => {
    const prices = Object.entries(edits).map(([k, price]) => {
      const [productId, unitId] = k.split(":").map(Number);
      return { productId, unitId, price };
    });
    setSaving(true);
    const res = await savePriceListPricesAction({
      priceListId: priceList.id,
      prices,
    });
    setSaving(false);
    if (!res.success) return message.error(tAlerts(res.error));
    message.success(t("PricesSaved", { count: prices.length }));
    setEdits({});
    setReload((x) => x + 1);
  };

  const columns = [
    {
      title: t("Item"),
      key: "item",
      width: 260,
      onCell: (r) => ({ rowSpan: r.span }),
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{nameOf(r.product)}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            <bdi>{r.product.code}</bdi>
            {r.product.isPriceIncludeTax && (
              <Tag className="ms-2" color="geekblue">
                {t("InclTax")}
              </Tag>
            )}
          </div>
        </div>
      ),
    },
    {
      title: t("Unit"),
      key: "unit",
      width: 120,
      render: (_, r) => nameOf(r.unit),
    },
    {
      title: t("BasePrice"),
      key: "base",
      width: 130,
      render: (_, r) => money(r.basePrice),
    },
    {
      title: t("ListPrice"),
      key: "price",
      width: 180,
      render: (_, r) => (
        <InputNumber
          style={{ width: "100%" }}
          min={0}
          precision={decimals}
          controls={false}
          disabled={!canEdit}
          placeholder={money(r.basePrice)}
          value={priceOf(r)}
          status={r.key in edits ? "warning" : undefined}
          onChange={(v) => setPrice(r, v)}
        />
      ),
    },
    {
      title: t("Difference"),
      key: "diff",
      width: 120,
      render: (_, r) => {
        const p = priceOf(r);
        if (p == null || !r.basePrice) return "—";
        const pct = ((p - r.basePrice) / r.basePrice) * 100;
        return (
          <Tag color={pct > 0 ? "green" : pct < 0 ? "red" : "default"}>
            {pct > 0 ? "+" : ""}
            {pct.toFixed(1)}%
          </Tag>
        );
      },
    },
  ];
  const width = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          {t("PricesOf")}: {nameOf(priceList)}
        </h1>
        <Space wrap>
          {canEdit && (
            <>
              <Badge count={changedCount}>
                <Button
                  type="primary"
                  size="large"
                  icon={<SaveOutlined />}
                  disabled={!changedCount}
                  loading={saving}
                  onClick={save}
                >
                  {t("SaveChanges")}
                </Button>
              </Badge>
              <Button
                size="large"
                icon={<UndoOutlined />}
                disabled={!changedCount}
                onClick={() => setEdits({})}
              >
                {t("DiscardChanges")}
              </Button>
            </>
          )}
          <Link href="/settings/price-lists">
            <Button size="large" icon={<ArrowRightOutlined />}>
              {t("BackToLists")}
            </Button>
          </Link>
        </Space>
      </div>

      <Alert type="info" showIcon className="mb-3" title={t("PricesHint")} />

      <Space wrap className="mb-3">
        <SearchBox
          width={360}
          placeholder={t("SearchItems")}
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          onSearch={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 240 }}
          placeholder={t("AllCategories")}
          value={categoryId}
          onChange={(v) => {
            setCategoryId(v);
            setPage(1);
          }}
          options={categories.map((c) => ({
            value: c.id,
            label: c.parent ? `${nameOf(c.parent)} / ${nameOf(c)}` : nameOf(c),
          }))}
        />
      </Space>

      <Table
        bordered
        size="small"
        rowKey="key"
        loading={loading}
        columns={columns}
        dataSource={rows}
        tableLayout="fixed"
        scroll={{ x: width }}
        rowClassName={(r) => (r.key in edits ? "price-row--changed" : "")}
        pagination={false}
      />
      {/* الصفحات بعدد الأصناف (الجدول فيه صف لكل وحدة) */}
      <div className="flex justify-center mt-3">
        <Pagination
          current={page}
          pageSize={data.pageSize}
          total={data.total}
          showSizeChanger={false}
          onChange={setPage}
        />
      </div>
    </div>
  );
}
