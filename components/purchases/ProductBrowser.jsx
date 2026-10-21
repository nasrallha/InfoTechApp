"use client";

import { useEffect, useRef, useState } from "react";
import { Button, InputNumber, Modal, Select, Space, Table } from "antd";
import { message } from "@/components/common/feedback";
import { AppstoreAddOutlined, PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { browsePurchaseProductsAction } from "@/actions/purchase.actions";
import { useCurrency } from "@/components/common/CurrencyProvider";
import SearchBox from "@/components/common/SearchBox";

// ============================================================
// نافذة تصفح الأصناف: للأصناف التي ليس لها باركود أو لا نعرف كودها
// - بحث بالاسم أو الكود + فلتر القسم + صفحات
// - لكل صنف: الوحدة والكمية وسعر الشراء (يبدأ بآخر تكلفة ويمكن تغييره)
// - نعلّم على أكثر من صنف ثم "إضافة المختار"، أو زر ➕ لصنف واحد
// - تعديل أي خانة في الصف يعلّم عليه تلقائياً
// onAdd(product, unitId, { qty, price }): نفس دالة الإضافة في الفاتورة
// defaultPrice(unit, product): السعر الافتراضي (آخر تكلفة، شامل الضريبة لو الوضع شامل)
// priceIncl: الفاتورة شاملة الضريبة؟ (لعنوان العمود فقط)
// بدون defaultPrice: لا يوجد عمود سعر (التحويلات والجرد)
// browseAction: دالة التصفح (افتراضياً تصفح المشتريات)
// ============================================================
export default function ProductBrowser({
  categories = [],
  onAdd,
  defaultPrice,
  priceIncl,
  disabled,
  browseAction = browsePurchaseProductsAction,
  // البيع: عنوان عمود السعر، وبدون "آخر تكلفة" تحت السعر
  priceLabel,
  showLastCost = true,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState();
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  // المختار: { productId: { product, unitId, qty, price } }
  // (يبقى عند تغيير الصفحة أو البحث)
  const [selected, setSelected] = useState({});
  const requestId = useRef(0);

  const locale = useLocale();
  const t = useTranslations("Purchases");
  const tAlerts = useTranslations("Alerts");
  const { amount: money, decimals } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  // تحميل الأصناف عند فتح النافذة أو تغيير البحث/القسم/الصفحة
  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await browseAction({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q, categoryId, page, tAlerts]);

  const close = () => {
    setOpen(false);
    setSelected({});
  };

  const unitOf = (product, unitId) =>
    product.units.find((u) => u.unit.id === unitId) ?? product.units[0];

  // بيانات الصف: المختارة، أو الافتراضية (الوحدة الأساسية، كمية 1، آخر تكلفة)
  const withPrice = typeof defaultPrice === "function";
  const priceFor = (unit, product) =>
    withPrice ? defaultPrice(unit, product) : undefined;

  const entryOf = (product) =>
    selected[product.id] ?? {
      product,
      unitId: product.units[0].unit.id,
      qty: 1,
      price: priceFor(product.units[0], product),
    };

  const toggle = (product, checked) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[product.id] = prev[product.id] ?? entryOf(product);
      else delete next[product.id];
      return next;
    });

  // تعديل خانة في الصف (يعلّم عليه)
  const patch = (product, change) =>
    setSelected((prev) => ({
      ...prev,
      [product.id]: { ...(prev[product.id] ?? entryOf(product)), ...change },
    }));

  // تغيير الوحدة: السعر يرجع لآخر تكلفة هذه الوحدة
  const changeUnit = (product, unitId) =>
    patch(product, {
      unitId,
      price: priceFor(unitOf(product, unitId), product),
    });

  const send = ({ product, unitId, qty, price }) =>
    onAdd(product, unitId, {
      qty: qty > 0 ? qty : 1,
      ...(withPrice ? { price: price ?? 0 } : {}),
    });

  const addSelected = () => {
    const list = Object.values(selected);
    list.forEach(send);
    message.success(t("ItemsAdded", { count: list.length }));
    close();
  };

  const addOne = (product) => {
    send(entryOf(product));
    // الصنف أضيف: نشيله من المختار حتى لا يتكرر مع "إضافة المختار"
    setSelected((prev) => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
    message.success(t("ItemsAdded", { count: 1 }));
  };

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.parent ? `${nameOf(c.parent)} / ${nameOf(c)}` : nameOf(c),
  }));

  // عناصر الإدخال داخل الصف لا تعلّم/تلغي الصف عند الضغط عليها
  const stop = (e) => e.stopPropagation();

  const columns = [
    {
      title: t("Item"),
      key: "name",
      width: 220,
      render: (_, p) => (
        <div>
          <div className="pur-line__name">{nameOf(p)}</div>
          <div className="pur-line__code">
            <bdi>{p.code}</bdi>
            {p.category && <> · {nameOf(p.category)}</>}
          </div>
        </div>
      ),
    },
    {
      title: t("Unit"),
      key: "unit",
      width: 120,
      render: (_, p) => (
        <Select
          size="small"
          style={{ width: "100%" }}
          value={entryOf(p).unitId}
          onClick={stop}
          onChange={(v) => changeUnit(p, v)}
          options={p.units.map((u) => ({
            value: u.unit.id,
            label: nameOf(u.unit),
          }))}
        />
      ),
    },
    {
      title: t("Qty"),
      key: "qty",
      width: 90,
      render: (_, p) => (
        <InputNumber
          size="small"
          style={{ width: "100%" }}
          min={0}
          precision={3}
          controls={false}
          value={entryOf(p).qty}
          onClick={stop}
          onFocus={(e) => e.target.select()}
          formatter={(v) => (v === "" || v == null ? "" : String(Number(v)))}
          onChange={(v) => patch(p, { qty: v ?? 0 })}
        />
      ),
    },
    withPrice && {
      title:
        priceLabel ?? (priceIncl ? t("PurchasePriceIncl") : t("PurchasePrice")),
      key: "price",
      width: 130,
      render: (_, p) => {
        const entry = entryOf(p);
        const unit = unitOf(p, entry.unitId);
        return (
          <div>
            <InputNumber
              size="small"
              style={{ width: "100%" }}
              min={0}
              precision={decimals}
              controls={false}
              value={entry.price}
              onClick={stop}
              onFocus={(e) => e.target.select()}
              onChange={(v) => patch(p, { price: v ?? 0 })}
            />
            {showLastCost && (
              <div className="pur-line__code">
                {t("LastCost")}: {money(unit.cost)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "",
      key: "add",
      width: 55,
      render: (_, p) => (
        <Button
          size="small"
          type="primary"
          ghost
          icon={<PlusOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            addOne(p);
          }}
        />
      ),
    },
  ].filter(Boolean);

  const count = Object.keys(selected).length;

  return (
    <>
      <Button
        size="large"
        icon={<AppstoreAddOutlined />}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {t("BrowseItems")}
      </Button>

      <Modal
        open={open}
        onCancel={close}
        width={820}
        centered
        title={t("BrowseItems")}
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={close}>{t("Close")}</Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!count}
              onClick={addSelected}
            >
              {t("AddSelected", { count })}
            </Button>
          </Space>
        }
      >
        <Space wrap className="mb-3" style={{ width: "100%" }}>
          <SearchBox
            autoFocus
            width={340}
            placeholder={t("BrowseSearch")}
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
            options={categoryOptions}
          />
        </Space>

        <Table
          size="small"
          bordered
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={data.rows}
          tableLayout="fixed"
          scroll={{ y: 380 }}
          rowSelection={{
            selectedRowKeys: Object.keys(selected).map(Number),
            preserveSelectedRowKeys: true,
            onSelect: (p, checked) => toggle(p, checked),
            onSelectAll: (checked, _rows, changed) =>
              changed.forEach((p) => toggle(p, checked)),
          }}
          onRow={(p) => ({
            // الضغط على الصف يعلّم عليه، إلا لو الضغط على عنصر داخله
            // (العلامة، الوحدة، الكمية، السعر، زر الإضافة، أو قائمة منسدلة)
            onClick: (e) => {
              if (!e.currentTarget.contains(e.target)) return;
              if (
                e.target.closest(
                  "button, input, .ant-select, .ant-checkbox-wrapper, .ant-input-number",
                )
              )
                return;
              toggle(p, !selected[p.id]);
            },
            style: { cursor: "pointer" },
          })}
          pagination={{
            current: page,
            pageSize: data.pageSize,
            total: data.total,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
      </Modal>
    </>
  );
}
