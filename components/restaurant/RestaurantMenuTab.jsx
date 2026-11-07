"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  Button,
  Empty,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import SearchBox from "@/components/common/SearchBox";
import ExportButtons from "@/components/reports/ExportButtons";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCan } from "@/components/auth/AuthProvider";
import {
  addRestaurantItemsAction,
  removeRestaurantItemAction,
  searchMenuCandidatesAction,
} from "@/actions/restaurant.actions";
import { imageUrl } from "@/lib/image";
import { C } from "@/lib/theme";
import RestaurantItemModal, { channelDefaultPrice } from "./RestaurantItemModal";
import "@/components/common/table.css";

// ============================================================
// المنيو: أصناف المطعم (صنف عادي من الأصناف + أحجامه وإضافاته)
// - «صنف جديد»: الصنف كله من هنا (الاسم والسعر والصورة والأحجام والإضافات)
// - «ربط أصناف موجودة»: أصناف متسجلة قبل كده تدخل المنيو
// - تصدير المنيو Excel / PDF / طباعة
// ============================================================
export default function RestaurantMenuTab({ catalog }) {
  const t = useTranslations("Restaurant");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const locale = useLocale();
  const can = useCan();
  const canManage = can("restaurant.manage");
  const { amount: money } = useCurrency();
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const { items, sizes, groups, channels } = catalog;
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [adding, setAdding] = useState(false);
  // null مقفولة | "new" صنف جديد | سطر الصنف
  const [editing, setEditing] = useState(null);

  const sizeName = useMemo(
    () => new Map(sizes.map((s) => [s.id, nm(s)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sizes, locale],
  );
  const groupName = useMemo(
    () => new Map(groups.map((g) => [g.id, nm(g)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, locale],
  );

  const rows = useMemo(() => {
    const s = applied.trim().toLowerCase();
    if (!s) return items;
    return items.filter((i) =>
      [i.product.code, i.product.arName, i.product.enName].some((v) =>
        String(v ?? "").toLowerCase().includes(s),
      ),
    );
  }, [items, applied]);

  // التصدير: سعر كل حجم في عمود (أو السعر للصنف من غير أحجام) + الإضافات
  const usedSizes = sizes.filter((s) =>
    rows.some((r) => r.sizes.some((x) => x.sizeId === s.id)),
  );
  const activeChannels = channels.filter((c) => c.isActive);
  const build = () => ({
    title: t("MenuExportTitle"),
    fileName: "menu",
    landscape: usedSizes.length + activeChannels.length > 2,
    info: [[t("ItemsN"), rows.length]],
    columns: [
      { title: "#", key: "no", type: "number", width: 6 },
      { title: t("Code"), key: "code", width: 12 },
      { title: t("Item"), key: "item" },
      { title: t("Category"), key: "category" },
      { title: t("Price"), key: "price", type: "money" },
      ...usedSizes.map((s) => ({ title: nm(s), key: `s${s.id}`, type: "money" })),
      { title: t("Modifiers"), key: "groups" },
      ...activeChannels.map((c) => ({
        title: nm(c),
        key: `c${c.id}`,
        type: "money",
      })),
    ],
    rows: rows.map((r, i) => {
      const sp = new Map(r.sizes.map((x) => [x.sizeId, x.price]));
      // سعر التطبيق: الخاص، أو السعر + الزيادة (للصنف من غير حجم / أول حجم)
      const firstSize = r.sizes[0];
      const appBase = firstSize ? firstSize.price : r.product.price;
      return {
        key: r.productId,
        no: i + 1,
        code: r.product.code,
        item: nm(r.product),
        category: nm(r.product.category),
        price: r.sizes.length ? null : r.product.price,
        ...Object.fromEntries(usedSizes.map((s) => [`s${s.id}`, sp.get(s.id) ?? null])),
        groups: r.groupIds.map((id) => groupName.get(id)).join("، "),
        ...Object.fromEntries(
          activeChannels.map((c) => {
            const special = r.channelPrices.find(
              (p) => p.channelId === c.id && p.sizeId === (firstSize?.sizeId ?? 0),
            );
            return [`c${c.id}`, special?.price ?? channelDefaultPrice(appBase, c)];
          }),
        ),
      };
    }),
    totals: null,
  });

  const remove = async (r) => {
    const res = await removeRestaurantItemAction(r.productId);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("RemovedFromMenu"));
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <SearchBox
          width={360}
          placeholder={t("SearchMenu")}
          value={q}
          onChange={setQ}
          onSearch={setApplied}
        />
        <Space wrap>
          <ExportButtons disabled={!rows.length} build={build} />
          {canManage && (
            <Button icon={<LinkOutlined />} onClick={() => setAdding(true)}>
              {t("AddItems")}
            </Button>
          )}
          {canManage && can("products.create") && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setEditing("new")}
            >
              {t("NewItem")}
            </Button>
          )}
        </Space>
      </div>

      <Table
        rowKey="productId"
        size="small"
        dataSource={rows}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        scroll={{ x: 900 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("MenuEmpty")}
            />
          ),
        }}
        columns={[
          {
            title: t("Item"),
            render: (_, r) => (
              <Space>
                <Avatar
                  shape="square"
                  size={36}
                  src={r.product.image ? imageUrl(r.product.image) : undefined}
                >
                  {nm(r.product).slice(0, 1)}
                </Avatar>
                <span>
                  <b>{nm(r.product)}</b>
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    <bdi>{r.product.code}</bdi> · {nm(r.product.category)}
                  </div>
                </span>
                {!r.product.isActive && <Tag>{t("Inactive")}</Tag>}
              </Space>
            ),
          },
          {
            title: t("PriceSizes"),
            render: (_, r) =>
              r.sizes.length ? (
                <Space size={[4, 4]} wrap>
                  {r.sizes.map((s) => (
                    <Tag key={s.sizeId}>
                      {sizeName.get(s.sizeId)}: <b>{money(s.price)}</b>
                    </Tag>
                  ))}
                </Space>
              ) : (
                <b>{money(r.product.price)}</b>
              ),
          },
          {
            title: t("Modifiers"),
            render: (_, r) =>
              r.groupIds.length ? (
                <Space size={[4, 4]} wrap>
                  {r.groupIds.map((id) => (
                    <Tag key={id}>{groupName.get(id)}</Tag>
                  ))}
                </Space>
              ) : (
                "—"
              ),
          },
          {
            title: t("Apps"),
            width: 110,
            render: (_, r) =>
              r.channelPrices.length ? (
                <Tag>{t("SpecialPrices", { n: r.channelPrices.length })}</Tag>
              ) : (
                <span style={{ color: C.muted }}>{t("AppDefault")}</span>
              ),
          },
          {
            title: t("Tobacco"),
            width: 90,
            render: (_, r) =>
              r.isTobacco ? <Tag color="orange">{t("Yes")}</Tag> : "—",
          },
          ...(canManage
            ? [
                {
                  title: "",
                  width: 90,
                  render: (_, r) => (
                    <Space size={0}>
                      <Button
                        size="small"
                        type="text"
                        icon={<EditOutlined />}
                        title={tButtons("Edit")}
                        onClick={() => setEditing(r)}
                      />
                      <Popconfirm
                        title={t("ConfirmRemoveItem")}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => remove(r)}
                      >
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          title={t("RemoveFromMenu")}
                        />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />

      {adding && <AddItemsModal onClose={() => setAdding(false)} />}
      {editing && (
        <RestaurantItemModal
          item={editing === "new" ? null : editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

// ---------- إضافة أصناف موجودة للمنيو ----------
function AddItemsModal({ onClose }) {
  const t = useTranslations("Restaurant");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);
  const timer = useRef(null);

  // البحث (آخر طلب بس هو اللي بيتعرض)
  const search = (text) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const id = ++seq.current;
      setLoading(true);
      const res = await searchMenuCandidatesAction(text ?? "");
      if (id !== seq.current) return;
      setLoading(false);
      if (!res.success) return showActionError(res, tAlerts, locale);
      setOptions(res.data);
    }, 250);
  };
  useEffect(() => {
    search("");
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // الأصناف المختارة بتفضل ظاهرة حتى لو البحث اتغيّر
  const [picked, setPicked] = useState(new Map());
  const allOptions = useMemo(() => {
    const map = new Map(picked);
    for (const p of options) map.set(p.id, p);
    return [...map.values()].map((p) => ({
      value: p.id,
      label: `${p.code} — ${nm(p)}`,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, picked, locale]);

  const onChange = (ids) => {
    setSelected(ids);
    setPicked((prev) => {
      const next = new Map();
      for (const id of ids) {
        const p = prev.get(id) ?? options.find((o) => o.id === id);
        if (p) next.set(id, p);
      }
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    const res = await addRestaurantItemsAction(selected);
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("ItemsAdded", { n: res.data.added }));
    onClose();
  };

  return (
    <Modal
      open
      width={620}
      title={t("AddItems")}
      okText={t("AddN", { n: selected.length })}
      okButtonProps={{ disabled: !selected.length }}
      confirmLoading={saving}
      onCancel={onClose}
      onOk={save}
      destroyOnHidden
    >
      <p style={{ color: C.muted, fontSize: 13 }}>{t("AddItemsHint")}</p>
      <Select
        mode="multiple"
        autoFocus
        showSearch
        filterOption={false}
        onSearch={search}
        style={{ width: "100%" }}
        placeholder={t("SearchProducts")}
        value={selected}
        onChange={onChange}
        options={allOptions}
        notFoundContent={loading ? <Spin size="small" /> : t("NoProducts")}
      />
    </Modal>
  );
}
