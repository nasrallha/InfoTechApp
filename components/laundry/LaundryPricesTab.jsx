"use client";

import { useMemo, useState } from "react";
import { Button, Empty, InputNumber, Space, Table, Tag } from "antd";
import { PlusOutlined, SaveOutlined, SkinOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import SearchBox from "@/components/common/SearchBox";
import ExportButtons from "@/components/reports/ExportButtons";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCan } from "@/components/auth/AuthProvider";
import { saveLaundryPricesAction } from "@/actions/laundry.actions";
import { imageUrl } from "@/lib/image";
import { C } from "@/lib/theme";
import "@/components/common/table.css";
import "./laundry.css";

// صف "عادي / مستعجل" تحت اسم الخدمة: أزرق فاتح (laundry.css)
const subhead = () => ({ className: "laundry-subhead" });

// ============================================================
// جدول الأسعار: كل قطعة في سطر، ولكل خدمة عمودين (عادي / مستعجل)
// - العادي فاضي = الخدمة مش متاحة للقطعة دي
// - المستعجل فاضي = الخدمة مش متاحة مستعجل
// - التعديلات بتتجمع، والحفظ بيبعت القطع اللي اتغيّرت بس
// - الخدمات الموقوفة مش بتظهر، وأسعارها بتفضل زي ما هي
// ============================================================
export default function LaundryPricesTab({ items, services }) {
  const t = useTranslations("Laundry");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const can = useCan();
  const canManage = can("laundry.manage");
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  // التعديلات: { productId: { serviceId: { price, urgentPrice } } }
  const [changes, setChanges] = useState({});
  const [saving, setSaving] = useState(false);

  const active = services.filter((s) => s.isActive);
  const original = useMemo(
    () =>
      new Map(
        items.map((i) => [
          i.productId,
          new Map(i.prices.map((p) => [p.serviceId, p])),
        ]),
      ),
    [items],
  );

  // القيمة المعروضة: التعديل لو موجود، غير كده الأصلية
  const cell = (pid, sid) =>
    changes[pid]?.[sid] ??
    original.get(pid)?.get(sid) ?? { price: null, urgentPrice: null };

  const setCell = (pid, sid, field, value) =>
    setChanges((prev) => ({
      ...prev,
      [pid]: {
        ...prev[pid],
        [sid]: { ...cell(pid, sid), [field]: value ?? null },
      },
    }));

  const dirty = Object.keys(changes).length;

  const rows = useMemo(() => {
    const s = applied.trim().toLowerCase();
    if (!s) return items;
    return items.filter((i) =>
      [i.product.arName, i.product.enName, i.product.code].some((v) =>
        v?.toLowerCase().includes(s),
      ),
    );
  }, [items, applied]);

  const save = async () => {
    const payload = Object.keys(changes).map((key) => {
      const pid = Number(key);
      // كل الخدمات (حتى الموقوفة) بأسعارها، والفاضي = مش متاحة
      const merged = new Map(original.get(pid) ?? []);
      for (const [sid, v] of Object.entries(changes[key]))
        merged.set(Number(sid), { serviceId: Number(sid), ...v });
      return {
        productId: pid,
        prices: [...merged.values()]
          .filter((p) => p.price != null)
          .map((p) => ({
            serviceId: p.serviceId,
            price: p.price,
            urgentPrice: p.urgentPrice ?? null,
          })),
      };
    });
    setSaving(true);
    const res = await saveLaundryPricesAction(payload);
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("PricesSaved"));
    setChanges({});
  };

  // التصدير (Excel / طباعة / PDF): الأسعار المحفوظة للقطع الظاهرة (بعد البحث)
  // لكل خدمة عمودين: عادي ومستعجل، والفاضي = مش متاحة
  const build = () => ({
    title: t("ExportTitle"),
    fileName: "laundry-prices",
    landscape: active.length > 2,
    info: [[t("ItemsN"), rows.length]],
    columns: [
      { title: "#", key: "no", type: "number", width: 6 },
      { title: t("Code"), key: "code", width: 14 },
      { title: t("Item"), key: "item" },
      ...active.flatMap((s) => [
        { title: `${nm(s)} - ${t("Normal")}`, key: `p${s.id}`, type: "money" },
        {
          title: `${nm(s)} - ${t("Urgent")}`,
          key: `u${s.id}`,
          type: "money",
        },
      ]),
    ],
    rows: rows.map((r, i) => {
      const saved = original.get(r.productId);
      return {
        key: r.productId,
        no: i + 1,
        code: r.product.code,
        item: nm(r.product),
        ...Object.fromEntries(
          active.flatMap((s) => {
            const p = saved?.get(s.id);
            return [
              [`p${s.id}`, p?.price ?? null],
              [`u${s.id}`, p?.urgentPrice ?? null],
            ];
          }),
        ),
      };
    }),
    totals: null,
  });

  const priceInput = (pid, sid, field) => {
    const v = cell(pid, sid);
    // المستعجل من غير سعر عادي مالوش معنى
    const disabled =
      !canManage || (field === "urgentPrice" && v.price == null);
    return (
      <InputNumber
        size="small"
        min={0}
        precision={2}
        controls={false}
        disabled={disabled}
        value={v[field]}
        placeholder="—"
        onChange={(val) => setCell(pid, sid, field, val)}
        style={{ width: "100%" }}
      />
    );
  };

  const columns = [
    {
      title: t("Item"),
      fixed: "start",
      width: 220,
      render: (_, r) => (
        <Space>
          {r.product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl(r.product.image)}
              alt=""
              width={36}
              height={36}
              style={{ borderRadius: 8, objectFit: "cover" }}
            />
          ) : (
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                display: "inline-grid",
                placeItems: "center",
                background: C.bgSubtle,
                color: C.subtle,
              }}
            >
              <SkinOutlined />
            </span>
          )}
          <span>
            <b>{nm(r.product)}</b>
            <div style={{ color: C.muted, fontSize: 12 }}>
              <bdi>{r.product.code}</bdi>
              {!r.product.isActive && (
                <Tag className="ms-2" style={{ fontSize: 11 }}>
                  {t("Inactive")}
                </Tag>
              )}
            </div>
          </span>
        </Space>
      ),
    },
    ...active.map((s) => ({
      title: nm(s),
      align: "center",
      children: [
        {
          title: t("Normal"),
          width: 110,
          onHeaderCell: subhead,
          render: (_, r) => priceInput(r.productId, s.id, "price"),
        },
        {
          title: t("Urgent"),
          width: 110,
          onHeaderCell: subhead,
          render: (_, r) => priceInput(r.productId, s.id, "urgentPrice"),
        },
      ],
    })),
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <SearchBox
          width={360}
          placeholder={t("SearchItems")}
          value={q}
          onChange={setQ}
          onSearch={setApplied}
        />
        <Space wrap>
          <ExportButtons
            disabled={!rows.length || !active.length}
            build={build}
          />
          {can("products.create") && (
            <Link href="/products/addproduct?laundry=1">
              <Button icon={<PlusOutlined />}>{t("AddItem")}</Button>
            </Link>
          )}
          {canManage && (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              disabled={!dirty}
              loading={saving}
              onClick={save}
            >
              {dirty ? t("SaveChangesN", { n: dirty }) : t("SaveChanges")}
            </Button>
          )}
        </Space>
      </div>
      <div className="mb-3" style={{ color: C.muted, fontSize: 13 }}>
        {t("PricesHint")}
      </div>
      <Table
        rowKey="productId"
        size="small"
        bordered
        dataSource={rows}
        columns={columns}
        pagination={false}
        scroll={{ x: 220 + active.length * 220 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                active.length ? t("NoItems") : t("NoServicesForPrices")
              }
            />
          ),
        }}
      />
    </>
  );
}
