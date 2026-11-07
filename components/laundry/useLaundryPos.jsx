"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AutoComplete,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Space,
  Tag,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  FileSearchOutlined,
  MinusOutlined,
  PlusOutlined,
  SkinOutlined,
  UserOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import SearchBox from "@/components/common/SearchBox";
import DayPicker from "@/components/common/DayPicker";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useBizToday } from "@/components/common/useBusinessDay";
import PrintDocument from "@/components/printing/PrintDocument";
import { lineFromProduct } from "@/components/sales/SaleForm";
import {
  customerWalletsAction,
  deliverLaundryOrdersAction,
  findLaundryOrdersAction,
  laundryWalletPreviewAction,
  lookupLaundryCustomerAction,
  saveLaundryOrderAction,
} from "@/actions/laundry-order.actions";
import { imageUrl } from "@/lib/image";
import { formatDay } from "@/lib/dates";
import { C } from "@/lib/theme";
import LaundryLineModal from "./LaundryLineModal";
import LaundryReceipt from "./LaundryReceipt";
import LaundryWalletModal from "./LaundryWalletModal";
import { ORDER_COLORS } from "./orderColors";
import QuickAddParty from "@/components/parties/QuickAddParty";
import { useCan } from "@/components/auth/AuthProvider";
import "./laundry.css";

// ============================================================
// وضع المغسلة في شاشة الكاشير (وحدة laundry)
// الكاشير بيبقى شاشة المغسلة كلها:
// - كروت القطع ← نافذة الخدمة والمستعجل والإضافات ← سطر في السلة
// - العميل بالجوال (إجباري للقطع الجديدة، والاسم اختياري)
// - "حفظ كطلب" (F8): طلب من غير فاتورة + إيصال الطلب
// - "دفع" (F9): القطع الجديدة طلب + الطلبات المحمّلة ← فاتورة واحدة
// - تحميل طلبات للفوترة: رقم الطلب + يومه / باركود الإيصال / الجوال
//   (سطور الطلب المحمّل مقفولة: بتتفوتر زي ما اتسجلت)
// - تعديل طلب (?editOrder=id من شاشة الطلبات): سطوره بتنزل عادية تتعدل،
//   و"حفظ التعديل" (F8) أو "دفع" (التعديل يتحفظ الأول وبعدين يتفوتر)
// السطر: سطر فاتورة عادي (lineFromProduct) + laundry: { serviceId, ... }
// ============================================================

// الصنف بالشكل اللي سطر الفاتورة محتاجه (وحدة واحدة بسعر الخدمة)
const productLike = (item, price) => ({
  id: item.productId,
  code: item.code,
  arName: item.arName,
  enName: item.enName,
  units: [{ unit: item.baseUnit, factor: 1, price }],
  taxRate: item.taxRate,
  priceIncludesTax: item.isPriceIncludeTax,
  isService: true,
  cost: 0,
  categoryId: item.categoryId ?? null,
});

// السطور المتطابقة (القطع الجديدة) بتتجمع
const sameKey = (l) =>
  [
    l.productId,
    l.laundry.serviceId,
    l.laundry.isUrgent ? 1 : 0,
    [...l.laundry.addonIds].sort((a, b) => a - b).join("."),
    l.laundry.notes ?? "",
    l.laundry.price ?? "",
  ].join("|");

export const isLaundryLine = (l) => Boolean(l?.laundry);
// اللي ينفع يتعدل (الجاهز اتقفل)، ومن غير فاتورة
export const isEditableOrder = (o) =>
  Boolean(o) && ["received", "processing"].includes(o.status) && !o.saleId;
// سطر من طلب محمّل (مقفول)
export const isOrderLine = (l) => Boolean(l?.laundry?.orderId);

// سطور الطلبات المحمّلة (عرض بس، والسيرفر بيفوتر من الطلب نفسه)
export function orderLines(orders, catalog) {
  const byId = new Map((catalog?.items ?? []).map((i) => [i.productId, i]));
  return orders.flatMap((o) =>
    o.items.map((i) => {
      const item = byId.get(i.productId) ?? {
        productId: i.productId,
        code: "",
        arName: i.arName,
        enName: i.enName,
        baseUnit: { id: 0, arName: "", enName: "" },
        taxRate: 0,
        isPriceIncludeTax: true,
      };
      return {
        ...lineFromProduct(productLike(item, i.price), item.baseUnit.id, i.qty),
        key: `o${o.id}-${i.id}`,
        arName: i.arName,
        enName: i.enName,
        laundry: {
          orderId: o.id,
          dailyNo: o.dailyNo,
          bizDay: o.bizDay,
          serviceId: i.serviceId,
          serviceArName: i.serviceArName,
          serviceEnName: i.serviceEnName,
          isUrgent: i.isUrgent,
          addonIds: i.addons.map((a) => a.id),
          addons: i.addons,
          notes: i.notes,
          // السعر المحفوظ على الطلب (التعديل بيبعته)
          price: i.price,
        },
      };
    }),
  );
}

// سطور طلب للتعديل: زي القطع الجديدة (بتتعدل وتتشال)
export function editLines(order, catalog) {
  // من غير orderId: السطر مش مقفول (بيتعدل زي القطع الجديدة)
  return orderLines([order], catalog).map((l) => ({
    ...l,
    key: `e${l.key}`,
    laundry: { ...l.laundry, orderId: null, dailyNo: null, bizDay: null },
  }));
}

export function useLaundryPos({
  laundry,
  initialOrders = [],
  // الطلب اللي بيتعدل (من شاشة الطلبات)
  editOrder = null,
  items,
  setItems,
  setCustomerId,
  setLastKey,
  printSettings,
  // طرق الدفع (للاشتراك الجديد)
  methods = [],
  // العملاء (اختيار العميل في نافذة الاشتراكات)
  customers = [],
}) {
  const t = useTranslations("Laundry");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const today = useBizToday();
  const on = Boolean(laundry);
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const itemOf = useMemo(
    () => new Map((laundry?.items ?? []).map((i) => [i.productId, i])),
    [laundry],
  );
  const serviceOf = useMemo(
    () => new Map((laundry?.services ?? []).map((s) => [s.id, s])),
    [laundry],
  );
  const addonOf = useMemo(
    () =>
      new Map(
        (laundry?.groups ?? []).flatMap((g) => g.addons.map((a) => [a.id, a])),
      ),
    [laundry],
  );

  // الطلبات المحمّلة في السلة
  const [orders, setOrders] = useState(initialOrders);
  // العميل بالجوال (للقطع الجديدة): looked null = لسه ما اتبحثش
  // الطلب اللي بيتعدل: { id, dailyNo, bizDay }
  const [editing, setEditing] = useState(
    isEditableOrder(editOrder)
      ? { id: editOrder.id, dailyNo: editOrder.dailyNo, bizDay: editOrder.bizDay }
      : null,
  );
  const first = initialOrders[0] ?? (editing ? editOrder : null);
  const [phone, setPhone] = useState(first?.phone ?? "");
  const [customer, setCustomer] = useState(
    first ? { id: first.customerId, arName: first.customerName, enName: first.customerName } : null,
  );
  const [looked, setLooked] = useState(first ? true : null);
  const [newName, setNewName] = useState("");
  const [looking, setLooking] = useState(false);
  // خانة العميل: جوال أو كود أو اسم (الجوال الفعلي في phone)
  const [query, setQuery] = useState(first?.phone ?? "");
  // طلبات العميل اللي لسه ما اتسلمتش (تحت اسمه): فوترة / تسليم
  const [openOrders, setOpenOrders] = useState([]);
  // البحث عن طلب
  const [q, setQ] = useState("");
  const [day, setDay] = useState(today);
  const [found, setFound] = useState(null); // نتايج أكتر من طلب ← اختيار
  const [pickedIds, setPickedIds] = useState([]);
  // نافذة السطر: { item, key } (key = السطر للتعديل)
  const [picking, setPicking] = useState(null);
  // إيصال الطلب اللي بيتطبع (حفظ كطلب)
  const [receipt, setReceipt] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
  // الاشتراك: رصيد العميل (null = مش معروف) + نافذة الاشتراكات
  // walletPlan: كام يتخصم من الرصيد وكام الباقي (قبل الدفع)
  const can = useCan();
  const canWallet = can("laundrySubscriptions.view");
  const [walletBalance, setWalletBalance] = useState(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletPlan, setWalletPlan] = useState(null);

  const loadBalance = async (customerId) => {
    if (!customerId || !canWallet) return setWalletBalance(null);
    const res = await customerWalletsAction(customerId);
    setWalletBalance(res.success ? res.data.balance : null);
  };

  // الطلب المحمّل أول ما الشاشة تفتح: رصيد عميله
  // (مرة واحدة: الرصيد بيتحمّل من السيرفر)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (first?.customerId) loadBalance(first.customerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newLines = items.filter((l) => isLaundryLine(l) && !isOrderLine(l));
  const ordersLocked = orders.length > 0;

  const lookup = async (value) => {
    const p = (value ?? phone).trim();
    if (!p) return;
    setPhone(p);
    setLooking(true);
    const res = await lookupLaundryCustomerAction(p);
    setLooking(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    setCustomer(res.data.customer);
    setLooked(Boolean(res.data.customer));
    setCustomerId(res.data.customer?.id ?? null);
    loadBalance(res.data.customer?.id ?? null);
    setOpenOrders(res.data.open);
  };

  // اقتراحات العملاء وإنت بتكتب: الكود أو الاسم أو الجوال
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter((c) =>
        [String(c.code ?? ""), c.arName, c.enName, c.phone].some((v) =>
          v?.toLowerCase().includes(q),
        ),
      )
      .slice(0, 20);
  }, [customers, query]);

  // عميل من الاقتراحات: بالجوال (عشان طلباته ورصيده)، ومن غير جوال ← تنبيه
  const selectCustomer = (c) => {
    if (!c) return;
    if (c.phone) {
      setQuery(c.phone);
      lookup(c.phone);
    } else pickCustomer(c);
  };

  // Enter: جوال (9-11 رقم) ← بحث بالجوال (ولو مش مسجل: عميل جديد)
  // غير كده: الكود بالظبط، أو عميل واحد بالاسم
  const searchCustomer = (value) => {
    const text = (value ?? query).trim();
    if (!text) return;
    if (/^\d{9,11}$/.test(text)) return lookup(text);
    const byCode = customers.find((c) => String(c.code) === text);
    if (byCode) return selectCustomer(byCode);
    if (matches.length === 1) return selectCustomer(matches[0]);
    message.warning(t(matches.length ? "PickFromList" : "CustomerNotFound"));
  };

  // طلب من طلبات العميل ← السلة (للفوترة)
  const addOpenOrder = async (o) => {
    const res = await findLaundryOrdersAction({ q: `LO${o.id}`, day: null });
    if (!res.success) return showActionError(res, tAlerts, locale);
    if (!res.data.length) return message.warning(t("NoOrdersToInvoice"));
    loadOrders(res.data);
  };

  // طلب مفوتر (مدفوع) ← تسليم
  const deliverOpenOrder = async (o) => {
    const res = await deliverLaundryOrdersAction({ ids: [o.id] });
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("DeliveredN", { n: res.data.updated }));
    setOpenOrders((prev) => prev.filter((x) => x.id !== o.id));
  };

  // ---------- القطع الجديدة ----------
  const addLine = (item, line, editKey) => {
    const p = item.prices.find((x) => x.serviceId === line.serviceId);
    // السعر المكتوب بإيد (بصلاحية) أو سعر القائمة
    const price = line.price ?? (line.isUrgent ? p.urgentPrice : p.price);
    const service = serviceOf.get(line.serviceId);
    const built = {
      ...lineFromProduct(productLike(item, price), item.baseUnit.id, line.qty),
      laundry: {
        serviceId: line.serviceId,
        serviceArName: service?.arName ?? "",
        serviceEnName: service?.enName ?? "",
        isUrgent: line.isUrgent,
        addonIds: line.addonIds,
        notes: line.notes,
        price: line.price ?? null,
      },
    };
    setItems((prev) => {
      const rest = editKey ? prev.filter((l) => l.key !== editKey) : prev;
      const key = sameKey(built);
      const same = rest.find(
        (l) => isLaundryLine(l) && !isOrderLine(l) && sameKey(l) === key,
      );
      if (same) {
        setLastKey(same.key);
        return rest.map((l) =>
          l === same ? { ...l, qty: l.qty + built.qty } : l,
        );
      }
      setLastKey(built.key);
      return [...rest, built];
    });
  };

  // ---------- تحميل الطلبات ----------
  const loadOrders = (list) => {
    if (!list.length) return;
    // كل الطلبات في الفاتورة لنفس العميل
    const cust = orders[0]?.customerId ?? list[0].customerId;
    if (list.some((o) => o.customerId !== cust))
      return message.error(tAlerts("LaundryOrdersMixedCustomers"));
    const fresh = list.filter((o) => !orders.some((x) => x.id === o.id));
    if (!fresh.length) return message.info(t("OrderAlreadyInCart"));
    setOrders((prev) => [...prev, ...fresh]);
    setItems((prev) => [...prev, ...orderLines(fresh, laundry)]);
    setPhone(fresh[0].phone);
    setQuery(fresh[0].phone);
    setCustomer({
      id: fresh[0].customerId,
      arName: fresh[0].customerName,
      enName: fresh[0].customerName,
    });
    setLooked(true);
    setCustomerId(fresh[0].customerId);
    loadBalance(fresh[0].customerId);
    message.success(
      t("OrdersLoadedN", { list: fresh.map((o) => o.dailyNo).join(" • ") }),
    );
  };

  // عميل جديد ببياناته كاملة (شركة / فندق...) من نفس فورم العملاء
  const pickCustomer = (c) => {
    if (!c.phone) message.warning(t("CustomerNeedsPhone"));
    setPhone(c.phone ?? "");
    setQuery(c.phone ?? (locale === "ar" ? c.arName : c.enName));
    setCustomer(c);
    setLooked(c.phone ? true : null);
    setCustomerId(c.id);
    loadBalance(c.id);
  };

  const searchOrders = async (value) => {
    const text = (value ?? q).trim();
    if (!text) return;
    const res = await findLaundryOrdersAction({ q: text, day });
    if (!res.success) return showActionError(res, tAlerts, locale);
    if (!res.data.length) return message.warning(t("NoOrdersToInvoice"));
    if (res.data.length === 1) {
      loadOrders(res.data);
      setQ("");
      return;
    }
    setFound(res.data);
    setPickedIds(res.data.map((o) => o.id));
  };

  // شيل طلب محمّل (كل سطوره)
  const removeOrder = (orderId) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    setItems((prev) => prev.filter((l) => l.laundry?.orderId !== orderId));
  };

  const reset = () => {
    setQuery("");
    setEditing(null);
    setOpenOrders([]);
    setWalletBalance(null);
    setWalletPlan(null);
    setOrders([]);
    setPhone("");
    setCustomer(null);
    setLooked(null);
    setNewName("");
    setQ("");
  };

  // ---------- التحقق قبل الدفع / الحفظ ----------
  const customerError = () => {
    if (!newLines.length) return null;
    if (!phone.trim()) return t("PhoneRequired");
    if (looked === null) return t("SearchPhoneFirst");
    return null;
  };

  const newOrderPayload = () =>
    newLines.length
      ? {
          customerId: customer?.id ?? null,
          phone: phone.trim(),
          customerName: customer ? null : newName.trim() || null,
          notes: null,
          items: newLines.map((l) => ({
            productId: l.productId,
            serviceId: l.laundry.serviceId,
            isUrgent: l.laundry.isUrgent,
            addonIds: l.laundry.addonIds,
            qty: Number(l.qty),
            notes: l.laundry.notes ?? null,
            price: l.laundry.price ?? null,
          })),
        }
      : null;

  // التعديل: الطلب نفسه بيتفوتر (بعد ما التعديل يتحفظ في saveEdit)
  const checkoutPayload = () =>
    editing
      ? { orderIds: [editing.id], newOrder: null }
      : { orderIds: orders.map((o) => o.id), newOrder: newOrderPayload() };

  // قبل الدفع في وضع التعديل: التعديل يتحفظ الأول
  const saveEdit = () =>
    saveLaundryOrderAction({ ...newOrderPayload(), id: editing.id });

  // حفظ كطلب (من غير فاتورة) + إيصال الطلب
  // المشترك اللي عنده رصيد: مفيش طلب من غير فاتورة، الفاتورة بتتخصم من الرصيد
  const canSaveOrder =
    on && newLines.length > 0 && !ordersLocked && !(walletBalance > 0);
  // onPrinted(order): بعد ما طباعة إيصال الطلب تخلص (واتساب التلقائي)
  const saveOrder = async (onSaved, onPrinted) => {
    if (!canSaveOrder) return;
    const err = customerError();
    if (err) return message.warning(err);
    setSavingOrder(true);
    const res = await saveLaundryOrderAction(
      editing ? { ...newOrderPayload(), id: editing.id } : newOrderPayload(),
    );
    setSavingOrder(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(
      t(editing ? "OrderUpdatedN" : "OrderSavedN", {
        n: res.data.dailyNo,
        day: formatDay(res.data.bizDay),
      }),
    );
    setReceipt({ order: res.data, onPrinted });
    onSaved?.(res.data);
  };

  // ---------- العرض ----------
  // تحت اسم السطر: الخدمة + مستعجل + الإضافات + رقم الطلب المحمّل
  const lineMeta = (l) => {
    const x = l.laundry;
    const extras = [
      ...(x.addons ?? x.addonIds.map((id) => addonOf.get(id))).map((a) =>
        a ? nm(a) : null,
      ),
      x.notes,
    ].filter(Boolean);
    return (
      <div className="pos-line__meta">
        <b>
          {locale === "ar"
            ? x.serviceArName || x.serviceEnName
            : x.serviceEnName || x.serviceArName}
        </b>
        {x.isUrgent && (
          <Tag color="orange" className="ms-1">
            {t("Urgent")}
          </Tag>
        )}
        {x.orderId && (
          <Tag color="purple" className="ms-1">
            {t("OrderNo")} {x.dailyNo} ({formatDay(x.bizDay)})
          </Tag>
        )}
        {extras.length > 0 && <div>{extras.join(" • ")}</div>}
      </div>
    );
  };

  const editLine = (l) => {
    const item = itemOf.get(l.productId);
    if (!item || isOrderLine(l)) return;
    setPicking({ item, key: l.key, line: { ...l.laundry, qty: l.qty } });
  };

  // سطر المغسلة في السلة (بنفس شكل سطر الكاشير)
  // - القطعة الجديدة: العدد (− / +) وتعديل وحذف
  // - سطر طلب محمّل: مقفول، والحذف بيشيل الطلب كله من السلة
  const renderLine = (l, { lastKey, onQty, onRemove }) => {
    const locked = isOrderLine(l);
    return (
      <div
        key={l.key}
        className={`pos-line ${l.key === lastKey ? "is-last" : ""}`}
      >
        <div>
          <div className="pos-line__name">{nm(l)}</div>
          {lineMeta(l)}
        </div>
        <div className="pos-line__total">{money(l.total)}</div>
        <div className="pos-line__controls">
          {locked ? (
            <span className="pos-line__meta">
              {t("Qty")}: <b>{l.qty}</b> × <bdi>{money(l.price)}</bdi>
            </span>
          ) : (
            <span className="pos-qty">
              <Button
                className="pos-qty__minus"
                icon={<MinusOutlined />}
                aria-label={t("Decrease")}
                title={t("Decrease")}
                onClick={() =>
                  l.qty <= 1 ? onRemove(l.key) : onQty(l.key, l.qty - 1)
                }
              />
              <InputNumber
                min={1}
                max={999}
                precision={0}
                controls={false}
                value={l.qty}
                onFocus={(e) => e.target.select()}
                onChange={(v) => onQty(l.key, v || 1)}
              />
              <Button
                className="pos-qty__plus"
                icon={<PlusOutlined />}
                aria-label={t("Increase")}
                title={t("Increase")}
                onClick={() => onQty(l.key, Math.min(999, l.qty + 1))}
              />
            </span>
          )}
          {!locked && (
            <Button
              icon={<EditOutlined />}
              aria-label={t("EditLine")}
              title={t("EditLine")}
              onClick={() => editLine(l)}
            />
          )}
          <span style={{ flex: 1 }} />
          <Button
            className="pos-line__delete"
            icon={<DeleteOutlined />}
            onClick={() =>
              locked ? removeOrder(l.laundry.orderId) : onRemove(l.key)
            }
          >
            {locked ? t("RemoveOrder") : t("RemoveLine")}
          </Button>
        </div>
      </div>
    );
  };

  const head = on && (
    <>
      {editing && (
        <div className="lp-editing">
          <EditOutlined /> {t("EditingOrderN", { n: editing.dailyNo, day: formatDay(editing.bizDay) })}
        </div>
      )}
      {/* تحميل طلب للفوترة (مش في وضع التعديل) */}
      {!editing && (
      <div className="lp-order-search">
        <SearchBox
          placeholder={t("FindOrderPlaceholder")}
          buttonText={<FileSearchOutlined />}
          value={q}
          onChange={setQ}
          onSearch={searchOrders}
        />
        <DayPicker
          value={day}
          onChange={(v) => setDay(v || today)}
          max={today}
          style={{ width: 130 }}
          title={t("OrderDayHint")}
        />
      </div>
      )}
      {/* العميل بالجوال + عميل جديد ببياناته كاملة */}
      <Space.Compact style={{ width: "100%" }}>
      <AutoComplete
        style={{ width: "100%" }}
        value={query}
        disabled={ordersLocked}
        options={matches.map((c) => ({
          value: String(c.id),
          label: `${c.code} - ${nm(c)}${c.phone ? ` (${c.phone})` : ""}`,
        }))}
        onSelect={(id) =>
          selectCustomer(customers.find((c) => String(c.id) === id))
        }
        onChange={(v) => {
          setQuery(v ?? "");
          setPhone("");
          setLooked(null);
          setCustomer(null);
          setCustomerId(null);
          setWalletBalance(null);
          setOpenOrders([]);
        }}
      >
        <Input.Search
          maxLength={100}
          prefix={<UserOutlined />}
          placeholder={t("CustomerSearchPlaceholder")}
          enterButton={t("Find")}
          loading={looking}
          autoComplete="off"
          onSearch={searchCustomer}
        />
      </AutoComplete>
      {!ordersLocked && (
        <QuickAddParty kind="customers" onCreated={pickCustomer} />
      )}
      </Space.Compact>
      {looked === true && customer && (
        <div className="lr-customer">
          <b>{nm(customer)}</b>
          {customer.code != null && (
            <Tag>
              {t("CustomerCode")} <bdi>{customer.code}</bdi>
            </Tag>
          )}
        </div>
      )}
      {/* طلبات العميل اللي لسه ما اتسلمتش: كل طلب بحالته */}
      {openOrders.length > 0 && (
        <div className="lp-open-orders">
          <div className="lp-open-orders__title">
            {t("OpenOrdersN", { n: openOrders.length })}
          </div>
          {openOrders.map((o) => {
            const inCart = orders.some((x) => x.id === o.id);
            return (
              <div key={o.id} className="lp-open-order">
                <span>
                  <b>{o.dailyNo}</b> ({formatDay(o.bizDay)}) —{" "}
                  {t("PiecesN", { n: o.totalQty })} —{" "}
                  <bdi>{money(o.totalAmount)}</bdi>
                  <Tag className="ms-1" color={ORDER_COLORS[o.status]}>
                    {t(`Status_${o.status}`)}
                  </Tag>
                  <Tag color={o.saleId ? C.success : C.warning}>
                    {o.saleId ? t("Invoiced") : t("NotInvoiced")}
                  </Tag>
                </span>
                {o.saleId ? (
                  can("laundryOrders.update") && (
                    <Button size="small" onClick={() => deliverOpenOrder(o)}>
                      {t("Deliver")}
                    </Button>
                  )
                ) : (
                  <Button
                    size="small"
                    type="primary"
                    disabled={inCart || Boolean(editing)}
                    onClick={() => addOpenOrder(o)}
                  >
                    {inCart ? t("InCart") : t("AddToInvoice")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {looked === false && (
        <Input
          autoComplete="off"
          maxLength={255}
          placeholder={t("NewCustomerNameOptional")}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
      )}
      {/* الاشتراك: الرصيد + نافذة الاشتراكات (اشتراك جديد / الصرف) */}
      {canWallet && looked !== null && (
        <div className="lp-wallet-chip">
          <span>
            <WalletOutlined /> {t("WalletBalance")}:{" "}
            <b>
              <bdi>{money(walletBalance ?? 0)}</bdi>
            </b>
          </span>
          <Button size="small" onClick={() => setWalletOpen(true)}>
            {t("Subscriptions")}
          </Button>
        </div>
      )}
    </>
  );

  const catalog = on && (
    <div className="pos-catalog">
      <div className="pos-grid">
        {laundry.items.length ? (
          laundry.items.map((i) => {
            const min = Math.min(...i.prices.map((p) => p.price));
            return (
              <div
                key={i.productId}
                role="button"
                tabIndex={0}
                className="pos-tile"
                onClick={() => setPicking({ item: i, key: null, line: null })}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  setPicking({ item: i, key: null, line: null })
                }
              >
                <div className="pos-tile__img">
                  {i.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl(i.image)} alt="" />
                  ) : (
                    <SkinOutlined />
                  )}
                </div>
                <div className="pos-tile__name">{nm(i)}</div>
                <div className="pos-tile__price">
                  <span className="lr-tile__from">{t("FromPrice")}</span>{" "}
                  {money(min)}
                </div>
              </div>
            );
          })
        ) : (
          <div className="pos-more" style={{ color: C.muted }}>
            {t("NoReceiveItems")}
          </div>
        )}
      </div>
    </div>
  );

  // قبل الدفع: لو للعميل رصيد ← كام يتخصم منه وكام الباقي (من السيرفر)
  const prepareWallet = async (discount) => {
    setWalletPlan(null);
    if (!(walletBalance > 0)) return null;
    const res = await laundryWalletPreviewAction({
      ...checkoutPayload(),
      ...discount,
      payments: [],
      useWallet: true,
    });
    if (!res.success) {
      showActionError(res, tAlerts, locale);
      return null;
    }
    setWalletPlan(res.data);
    return res.data;
  };

  const modals = on && (
    <>
      {walletOpen && (
        <LaundryWalletModal
          customerId={customer?.id ?? null}
          phone={phone}
          customerName={newName}
          customers={customers}
          methods={methods}
          printSettings={printSettings}
          onClose={() => setWalletOpen(false)}
          onChanged={(balance, cust) => {
            if (cust && cust.id !== customer?.id && cust.phone !== phone) return;
            setWalletBalance(balance);
            // اشتراك لعميل السلة (أو سجّله / حدّث اسمه): يتحدث في رأس السلة
            // (اشتراك لعميل تاني من النافذة: السلة زي ما هي)
            if (cust && (cust.id === customer?.id || cust.phone === phone)) {
              setCustomer(cust);
              setLooked(true);
              setCustomerId(cust.id);
            }
          }}
        />
      )}
      {picking && (
        <LaundryLineModal
          item={picking.item}
          groups={laundry.groups}
          services={laundry.services}
          line={picking.line}
          canChangePrice={can("sales.changePrice")}
          onClose={() => setPicking(null)}
          onOk={(line) => {
            addLine(picking.item, line, picking.key);
            setPicking(null);
          }}
        />
      )}
      {found && (
        <Modal
          open
          title={t("PickOrders")}
          okText={t("LoadOrders")}
          okButtonProps={{ disabled: !pickedIds.length }}
          onOk={() => {
            loadOrders(found.filter((o) => pickedIds.includes(o.id)));
            setFound(null);
            setQ("");
          }}
          onCancel={() => setFound(null)}
          mask={{ closable: false }}
          destroyOnHidden
        >
          <Checkbox.Group
            value={pickedIds}
            onChange={setPickedIds}
            style={{ width: "100%" }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              {found.map((o) => (
                <Checkbox key={o.id} value={o.id}>
                  <b>{o.dailyNo}</b> ({formatDay(o.bizDay)}) — {o.customerName}{" "}
                  — {t("PiecesN", { n: o.totalQty })} —{" "}
                  <bdi>{money(o.totalAmount)}</bdi>
                </Checkbox>
              ))}
            </Space>
          </Checkbox.Group>
        </Modal>
      )}
      {receipt && (
        <PrintDocument
          paperSize={printSettings?.paperSize === "58mm" ? "58mm" : "80mm"}
          onDone={() => {
            const done = receipt;
            setReceipt(null);
            done?.onPrinted?.(done.order);
          }}
        >
          <LaundryReceipt
            order={receipt.order}
            paperSize={printSettings?.paperSize === "58mm" ? "58mm" : "80mm"}
            lang={printSettings?.language ?? "both"}
          />
        </PrintDocument>
      )}
    </>
  );

  return {
    on,
    editing,
    saveEdit,
    walletBalance,
    walletPlan,
    prepareWallet,
    clearWalletPlan: () => setWalletPlan(null),
    openWallets: () => setWalletOpen(true),
    orders,
    ordersLocked,
    newLines,
    head,
    catalog,
    modals,
    lineMeta,
    renderLine,
    editLine,
    removeOrder,
    reset,
    customerError,
    checkoutPayload,
    canSaveOrder,
    saveOrder,
    savingOrder,
  };
}
