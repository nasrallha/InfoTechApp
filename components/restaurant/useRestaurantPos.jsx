"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
} from "antd";
import {
  CarOutlined,
  CoffeeOutlined,
  MobileOutlined,
  ShopOutlined,
  ShoppingOutlined,
  TableOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  MinusOutlined,
  PlusOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import SearchBox from "@/components/common/SearchBox";
import { message, modal } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import PrintDocument from "@/components/printing/PrintDocument";
import { lineFromProduct } from "@/components/sales/SaleForm";
import {
  cancelOpenOrderAction,
  restaurantOrdersAction,
  saveOpenOrderAction,
} from "@/actions/restaurant-pos.actions";
import {
  acceptOnlineOrderAction,
  pendingOnlineCountAction,
  rejectOnlineOrderAction,
} from "@/actions/restaurant-online.actions";
import { getSaleAction } from "@/actions/sale.actions";
import { imageUrl } from "@/lib/image";
import {
  feeLinePrice,
  lineGross,
  linePrice,
  lineNote,
  restaurantFees,
} from "@/lib/restaurant-calc";
import { C } from "@/lib/theme";
import KitchenTicket from "./KitchenTicket";
import AgentPrinter from "@/components/printing/AgentPrinter";
import QuickAddParty from "@/components/parties/QuickAddParty";
import "./restaurant.css";

// سطر مطعم في السلة (صنف بحجمه وإضافاته) / سطر رسوم (محسوب لوحده)
export const isRestaurantLine = (l) => Boolean(l?.rest);
export const isFeeLine = (l) => Boolean(l?.restFee);

// توقيع السطر: نفس الصنف بنفس الحجم والإضافات والملاحظة = نفس السطر
const sig = (r) =>
  `${r.productId}|${r.sizeId || 0}|${[...r.modifierIds].sort((a, b) => a - b).join(",")}|${(r.notes ?? "").trim()}|${r.pieces || 0}`;

// الكمية بكسور: + / − بواحد، والعرض من غير أصفار زيادة (1.5 مش 1.500)
const qtyStep = (v, d) =>
  Math.min(999, Math.max(0.001, Math.round((Number(v) + d) * 1000) / 1000));
const fmtQty = (v) =>
  v === undefined || v === null || v === ""
    ? ""
    : String(Number(Number(v).toFixed(3)));

// رقم مسلسل لتذاكر الطابور (مفتاح كل نافذة طباعة)
let ticketSeq = 0;

const EMPTY_ORDER = {
  orderId: null,
  dailyNo: null,
  orderType: "takeaway",
  tableNo: "",
  tableId: null,
  partySize: null,
  channelId: null,
  channelOrderNo: "",
  driverId: null,
  customerName: "",
  phone: "",
  address: "",
};

// ============================================================
// كاشير المطعم (وحدة restaurant)
// - نوع الطلب: صالة (طاولة) / سفري / توصيل (السائق + الرسوم) / تطبيق (أسعاره)
// - الصنف: الحجم + الإضافات (بحدود كل مجموعة) + الكمية + ملاحظة
// - الرسوم سطور محسوبة لوحدها (الخدمة / التوصيل / التبغ) بنفس حساب السيرفر
// - الصالة: «حفظ الطاولة» بيحفظ الطلب ويطبع تذكرة المطبخ (من غير فاتورة)،
//   والحساب بعدين من «الطلبات» ← تحميل ← دفع
// - كل ده محتاج وردية مفتوحة (الفاتورة في درج الوردية)
// ============================================================
export function useRestaurantPos({
  restaurant,
  items,
  setItems,
  setLastKey,
  customerId,
  setCustomerId,
  customers,
  shift,
  printSettings,
  categories = [],
  // إعادة طباعة فاتورة طلب مدفوع (الكاشير بيجيبها ويطبعها)
  reprintSale,
  // عميل جديد من الكاشير (بيظهر في القائمة على طول)
  onCustomerCreated,
}) {
  const on = Boolean(restaurant);
  const t = useTranslations("RestaurantPos");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  // الإعدادات: نوع الطلب الافتراضي + الطاولة الافتراضية (لطلبات «طاولات»)
  // local محلي من غير طاولة | dinein طاولات (لازم طاولة) | takeaway | delivery | app
  const defaultTable = () => {
    const tb = (restaurant?.tables ?? []).find(
      (x) => x.id === restaurant?.settings.defaultTableId,
    );
    return tb ? { tableId: tb.id, tableNo: tb.name } : {};
  };
  const freshOrder = () => {
    let type = restaurant?.settings.defaultOrderType ?? "takeaway";
    if (type === "app" && !restaurant?.channels.length) type = "takeaway";
    return { ...EMPTY_ORDER, orderType: type, ...(type === "dinein" ? defaultTable() : {}) };
  };
  const [order, setOrder] = useState(freshOrder);
  const [servicePercent, setServicePercent] = useState(
    restaurant?.settings.servicePercent ?? 0,
  );
  const [deliveryFee, setDeliveryFee] = useState(
    restaurant?.settings.deliveryFee ?? 0,
  );
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  // نافذة الصنف: { item, line } (line = تعديل سطر موجود)
  const [picking, setPicking] = useState(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  // تذاكر المطبخ: طابور (تذكرة لكل طابعة تحضير، وبتطلع ورا بعض)
  const [tickets, setTickets] = useState([]);
  const ticket = tickets[0] ?? null;
  // اللي رايح لوسيط الطباعة (طابعات الشبكة / ويندوز) ← من غير نافذة طباعة
  const [agentQueue, setAgentQueue] = useState([]);
  const setTicket = (tk) => routeTickets(tk);
  // تذكرة المطبخ اللي هتتطبع بعد إيصال الفاتورة
  const queuedTicket = useRef(null);
  // السطور اللي اتبعتت للمطبخ (الطاولة المحمّلة): الجديد بس يتطبع
  const [sent, setSent] = useState(null);
  const [saving, setSaving] = useState(false);
  // الطلبات الأونلاين الجديدة (لسه ماتقبلتش)
  const [pending, setPending] = useState(0);
  const lastPending = useRef(0);
  // بيتزوّد بعد الحفظ / الدفع ← العداد يتحدّث على طول
  const [countTick, setCountTick] = useState(0);
  useEffect(() => {
    if (!on || !shift) return;
    let alive = true;
    const check = async () => {
      const res = await pendingOnlineCountAction();
      if (!alive || !res.success) return;
      // التنبيه: لما ييجي أونلاين جديد | العداد: كل اللي لسه مخلصش (جديد + مفتوح)
      if (res.data.pending > lastPending.current)
        message.info(t("NewOnlineOrder", { n: res.data.pending }));
      lastPending.current = res.data.pending;
      setPending(res.data.pending + res.data.open);
    };
    check();
    const timer = setInterval(check, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [on, shift, t, countTick]);

  const itemById = useMemo(
    () => new Map((restaurant?.items ?? []).map((i) => [i.productId, i])),
    [restaurant],
  );
  const groupById = useMemo(
    () => new Map((restaurant?.groups ?? []).map((g) => [g.id, g])),
    [restaurant],
  );
  const sizeById = useMemo(
    () => new Map((restaurant?.sizes ?? []).map((s) => [s.id, s])),
    [restaurant],
  );
  const channelById = useMemo(
    () => new Map((restaurant?.channels ?? []).map((c) => [c.id, c])),
    [restaurant],
  );
  const channel =
    order.orderType === "app" ? (channelById.get(order.channelId) ?? null) : null;

  // ---------- بناء سطر السلة ----------
  const modsOf = (ids) =>
    ids
      .map((id) => {
        for (const g of groupById.values()) {
          const m = g.modifiers.find((x) => x.id === id);
          if (m) return m;
        }
        return null;
      })
      .filter(Boolean);

  const buildLine = (rest, ch, key) => {
    const item = itemById.get(rest.productId);
    if (!item) return null;
    const mods = modsOf(rest.modifierIds);
    const price = linePrice(item, rest.sizeId, mods, ch);
    const unitId = item.product.units[0].unit.id;
    const line = lineFromProduct(item.product, unitId, rest.qty, price);
    const size = rest.sizeId ? sizeById.get(rest.sizeId) : null;
    return {
      ...line,
      ...(key ? { key } : {}),
      listPrice: price,
      rest: {
        productId: rest.productId,
        sizeId: rest.sizeId || 0,
        modifierIds: rest.modifierIds,
        notes: rest.notes ?? "",
        pieces: item.askPieces ? (rest.pieces ?? null) : null,
        isTobacco: item.isTobacco,
        // للعرض والمطبخ (بلغة الشاشة): عدد الحبات · الحجم · الإضافات · الملاحظة
        note: lineNote(
          [
            item.askPieces && rest.pieces ? t("PiecesN", { n: rest.pieces }) : null,
            size ? nm(size) : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
          mods.map((m) => nm(m)),
          rest.notes,
        ),
      },
    };
  };

  // تغيير التطبيق / النوع ← أسعار السطور تتحسب من جديد
  const reprice = (ch) =>
    setItems((prev) =>
      prev.map((l) =>
        isRestaurantLine(l)
          ? (buildLine({ ...l.rest, qty: l.qty }, ch, l.key) ?? l)
          : l,
      ),
    );

  const setType = (orderType) => {
    // طاولات: الطاولة الافتراضية لو مفيش طاولة مختارة
    setOrder((o) => ({
      ...o,
      orderType,
      ...(orderType === "dinein" && !o.tableNo ? defaultTable() : {}),
    }));
    const ch =
      orderType === "app" ? (channelById.get(order.channelId) ?? null) : null;
    reprice(ch);
  };
  const setChannel = (channelId) => {
    setOrder((o) => ({ ...o, channelId }));
    reprice(channelById.get(channelId) ?? null);
  };

  // إضافة / تعديل سطر من نافذة الصنف
  const putLine = (rest, editing) => {
    setItems((prev) => {
      const s = sig(rest);
      if (editing) {
        const next = buildLine(rest, channel, editing.key);
        return next ? prev.map((l) => (l.key === editing.key ? next : l)) : prev;
      }
      const same = prev.find((l) => isRestaurantLine(l) && sig(l.rest) === s);
      if (same) {
        setLastKey(same.key);
        return prev.map((l) =>
          l === same ? { ...l, qty: Math.min(999, l.qty + rest.qty) } : l,
        );
      }
      const line = buildLine(rest, channel);
      if (!line) return prev;
      setLastKey(line.key);
      return [...prev, line];
    });
  };

  // الضغط على الصنف: من غير أحجام ولا إضافات ← يتضاف على طول
  const pickItem = (item) => {
    if (!item.sizes.length && !item.groupIds.length)
      return putLine({
        productId: item.productId,
        sizeId: 0,
        modifierIds: [],
        notes: "",
        qty: 1,
      });
    setPicking({ item, line: null });
  };

  // ---------- الرسوم (سطور محسوبة) ----------
  const feeLines = useMemo(() => {
    if (!on) return [];
    const base = items
      .filter(isRestaurantLine)
      .map((l) => {
        const disc =
          l.discountType === "percent"
            ? (l.price * l.qty * (Number(l.discountValue) || 0)) / 100
            : Number(l.discountValue) || 0;
        return {
          amount: lineGross({
            price: l.price,
            qty: l.qty,
            taxRate: l.taxRate,
            inclusive: l.taxMode === "inclusive",
            discount: disc,
          }),
          qty: l.qty,
          isTobacco: l.rest.isTobacco,
        };
      });
    if (!base.length) return [];
    const fees = restaurantFees(base, {
      orderType: order.orderType,
      serviceType: restaurant.settings.serviceType,
      servicePercent,
      serviceDineInOnly: restaurant.settings.serviceDineInOnly,
      deliveryFee,
      tobaccoType: restaurant.settings.tobaccoType,
      tobaccoPercent: restaurant.settings.tobaccoPercent,
    });
    return ["tobacco", "service", "delivery"]
      .filter((k) => fees[k] > 0 && restaurant.fees[k])
      .map((k) => {
        const p = restaurant.fees[k];
        // المبلغ الشامل ← سعر من غير ضريبة (نفس حساب السيرفر)
        const price = feeLinePrice(fees[k], fees.inclusive[k], p.taxRate);
        return {
          ...lineFromProduct(p, p.units[0].unit.id, 1, price),
          key: `fee-${k}`,
          listPrice: price,
          restFee: k,
          // الرسوم بقيمتها الكاملة: بره خصم الفاتورة (نفس حساب السيرفر)
          noInvoiceDiscount: true,
        };
      });
  }, [on, items, order.orderType, servicePercent, deliveryFee, restaurant]);

  // ---------- البيانات اللي بتتبعت للسيرفر ----------
  const posLines = () =>
    items.filter(isRestaurantLine).map((l) => ({
      productId: l.rest.productId,
      sizeId: l.rest.sizeId || 0,
      modifierIds: l.rest.modifierIds,
      qty: Number(l.qty),
      notes: l.rest.notes || null,
      pieces: l.rest.pieces || null,
      discountType: l.discountType,
      discountValue: Number(l.discountValue) || 0,
    }));

  const orderPayload = () => {
    const cust = customers.find((c) => c.id === customerId);
    return {
      orderId: order.orderId,
      orderType: order.orderType,
      tableNo: order.tableNo || null,
      tableId: order.tableId ?? null,
      partySize: order.partySize ?? null,
      channelId: order.channelId,
      channelOrderNo: order.channelOrderNo || null,
      driverId: order.driverId,
      customerId: customerId ?? null,
      customerName: order.customerName || (cust ? nm(cust) : null),
      phone: order.phone || cust?.phone || null,
      address: order.address || null,
      deliveryFee: Number(deliveryFee) || 0,
      serviceType: restaurant.settings.serviceType,
      servicePercent: Number(servicePercent) || 0,
      lines: posLines(),
    };
  };
  const checkoutPayload = orderPayload;

  // قبل الدفع / الحفظ: ناقص إيه؟
  const validate = () => {
    if (!items.some(isRestaurantLine)) return t("EmptyOrder");
    if (order.orderType === "app" && !order.channelId) return t("ChooseApp");
    if (order.orderType === "dinein" && !order.tableNo.trim())
      return t("TableRequired");
    return null;
  };

  // ---------- تذكرة المطبخ ----------
  const ticketLines = (lines) =>
    lines.map((l) => ({
      productId: l.rest.productId,
      qty: l.qty,
      name: nm(l),
      note: l.rest.note,
    }));
  // الجديد بس (الطاولة المحمّلة): الفرق في الكمية لكل توقيع
  const newSince = (lines) => {
    if (!sent) return lines;
    const before = new Map(sent);
    const out = [];
    for (const l of lines) {
      const s = sig(l.rest);
      const had = before.get(s) ?? 0;
      const extra = l.qty - had;
      before.set(s, Math.max(0, had - l.qty));
      if (extra > 0) out.push({ ...l, qty: extra });
    }
    return out;
  };
  const makeTicket = (dailyNo, lines, added = false) => ({
    dailyNo,
    orderType: order.orderType,
    tableNo: order.orderType === "dinein" ? order.tableNo : null,
    channelName: channel ? nm(channel) : null,
    at: new Date().toISOString(),
    added,
    lines: ticketLines(lines),
  });

  // ---------- الطاولة: حفظ من غير فاتورة + تذكرة المطبخ ----------
  // حفظ الطلب من غير فاتورة (يتحاسب بعدين من «الطلبات»): كل الأنواع
  // الصالة على طاولة، والسفري / التوصيل / التطبيق طلب مفتوح
  const canSaveTable = on;
  const saveTable = async (clearCart) => {
    if (!shift) return message.warning(t("OpenShiftFirst"));
    const err = validate();
    if (err) return message.warning(err);
    const lines = items.filter(isRestaurantLine);
    const fresh = newSince(lines);
    setSaving(true);
    const res = await saveOpenOrderAction(orderPayload());
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(
      t(order.orderType === "dinein" ? "TableSaved" : "OrderSaved", {
        n: res.data.dailyNo,
      }),
    );
    setCountTick((x) => x + 1);
    if (fresh.length)
      setTicket(makeTicket(res.data.dailyNo, fresh, Boolean(order.orderId)));
    clearCart();
  };

  // بعد الفاتورة: تذكرة المطبخ (الطلب الجديد كله، أو الجديد على الطاولة)
  const afterPaid = (res) => {
    setCountTick((x) => x + 1);
    const lines = items.filter(isRestaurantLine);
    const fresh = newSince(lines);
    if (!fresh.length || !res.order) return null;
    const tk = makeTicket(res.order.dailyNo, fresh, Boolean(order.orderId));
    queuedTicket.current = tk;
    return tk;
  };
  // سطور الطاولة المفتوحة ← سطور للعرض والتذكرة (الاسم + الحجم والإضافات)
  const describeLines = (lines) =>
    lines.map((r) => {
      const item = itemById.get(r.productId);
      const size = r.sizeId ? sizeById.get(r.sizeId) : null;
      return {
        productId: r.productId,
        qty: r.qty,
        name: item ? nm(item.product) : `#${r.productId}`,
        note: lineNote(
          [r.pieces ? t("PiecesN", { n: r.pieces }) : null, size ? nm(size) : null]
            .filter(Boolean)
            .join(" · ") || null,
          modsOf(r.modifierIds ?? []).map((m) => nm(m)),
          r.notes,
        ),
      };
    });
  // أصناف الرسوم مش في تذكرة المطبخ
  const feeIds = new Set(
    Object.values(restaurant?.fees ?? {})
      .filter(Boolean)
      .map((p) => p.id),
  );
  // سطور الفاتورة (طلب مدفوع) ← سطور للعرض والتذكرة
  const describeSale = (sale) =>
    (sale?.items ?? [])
      .filter((i) => !feeIds.has(i.productId))
      .map((i) => ({
        productId: i.productId,
        qty: Number(i.qty),
        name: nm(i),
        note: i.note,
      }));
  // ---------- تقسيم التذكرة على طابعات التحضير ----------
  // الصنف: طابعاته الخاصة ← طابعات قسمه ← الافتراضية، ولو مفيش: تذكرة عامة
  // (مفيش طابعات تحضير متسجلة = تذكرة واحدة زي الأول)
  const kitchenPrinters = (restaurant?.printers ?? []).filter(
    (p) => p.kind === "kitchen" && p.isActive,
  );
  const splitTicket = (tk) => {
    if (!kitchenPrinters.length) return [{ ...tk }];
    const groups = new Map();
    const push = (key, printer, line) => {
      if (!groups.has(key)) groups.set(key, { printer, lines: [] });
      groups.get(key).lines.push(line);
    };
    for (const l of tk.lines) {
      const categoryId = itemById.get(l.productId)?.categoryId;
      let targets = kitchenPrinters.filter((p) => p.productIds.includes(l.productId));
      if (!targets.length)
        targets = kitchenPrinters.filter((p) => p.categoryIds.includes(categoryId));
      if (!targets.length) targets = kitchenPrinters.filter((p) => p.isDefault);
      if (!targets.length) push("none", null, l);
      for (const p of targets) push(p.id, p, l);
    }
    return [...groups.values()].map(({ printer, lines }) => ({
      ...tk,
      lines,
      ...printerFields(printer),
    }));
  };

  const printerFields = (p) =>
    p
      ? {
          printerId: p.id,
          printerName: p.name,
          paperSize: p.paperSize,
          connection: p.connection,
          copies: p.copies ?? 1,
        }
      : { printerId: null, printerName: null, paperSize: null, connection: null, copies: 1 };

  // طابعة الكاشير (الفاتورة): لو شبكة / ويندوز بتطبع عن طريق الوسيط
  const cashierPrinter =
    (restaurant?.printers ?? []).find((p) => p.kind === "cashier" && p.isActive) ?? null;
  const viaAgent = (p) => Boolean(p?.printerId && p.connection && p.connection !== "browser");

  // المتصفح: نافذة طباعة لكل نسخة
  const toBrowser = (part) => {
    const list = [];
    for (let c = 0; c < Math.max(1, part.copies ?? 1); c++)
      list.push({ ...part, qid: ++ticketSeq });
    setTickets((q) => [...q, ...list]);
  };

  // كل تذكرة على طابعتها: الوسيط (شبكة / ويندوز) أو المتصفح
  // + الكاشير: تذكرة كاملة بكل الأصناف (لو متفعّلة)
  // + مفيش طابعات تحضير: التذكرة على طابعة الكاشير
  const routeTickets = (tk) => {
    let parts = splitTicket(tk);
    if (!kitchenPrinters.length && cashierPrinter)
      parts = [{ ...tk, ...printerFields(cashierPrinter) }];
    else if (cashierPrinter?.fullTicket)
      parts = [...parts, { ...tk, ...printerFields(cashierPrinter) }];
    const agentItems = [];
    for (const part of parts) {
      if (!viaAgent(part)) {
        toBrowser(part);
        continue;
      }
      const paper = part.paperSize === "58mm" ? "58mm" : "80mm";
      agentItems.push({
        key: `t${++ticketSeq}`,
        printerId: part.printerId,
        title: `#${part.dailyNo} ${part.printerName ?? ""}`.trim(),
        paperSize: paper,
        part,
        render: () => (
          <KitchenTicket ticket={part} paperSize={paper} labels={ticketLabels} />
        ),
      });
    }
    if (agentItems.length) setAgentQueue((q) => [...q, ...agentItems]);
  };

  // الفاتورة: على طابعة الكاشير عن طريق الوسيط، وإلا fallback (المتصفح زي الأول)
  const printReceipt = ({ render, title, fallback }) => {
    if (!viaAgent(printerFields(cashierPrinter))) return fallback();
    const paper = cashierPrinter.paperSize === "58mm" ? "58mm" : "80mm";
    setAgentQueue((q) => [
      ...q,
      {
        key: `r${++ticketSeq}`,
        printerId: cashierPrinter.id,
        title,
        paperSize: paper,
        render: () => render(paper),
        fallback,
      },
    ]);
    return true;
  };

  // إعادة طباعة تذكرة المطبخ لأي طلب
  const printOrderTicket = (o, lines) =>
    setTicket({
      dailyNo: o.dailyNo,
      orderType: o.orderType,
      tableNo: o.tableNo,
      channelName: o.channel ? nm(o.channel) : null,
      at: new Date().toISOString(),
      added: false,
      lines,
    });

  const flushTicket = () => {
    if (queuedTicket.current) setTicket(queuedTicket.current);
    queuedTicket.current = null;
  };

  const reset = () => {
    // بعد كل طلب: يرجع للنوع الافتراضي (والطاولة الافتراضية)
    setOrder(freshOrder());
    setServicePercent(restaurant?.settings.servicePercent ?? 0);
    setDeliveryFee(restaurant?.settings.deliveryFee ?? 0);
    setSent(null);
  };

  // ---------- تحميل طلب (طاولة مفتوحة) في السلة ----------
  const loadOrder = (o) => {
    if (items.some(isRestaurantLine))
      return message.warning(t("FinishCurrentFirst"));
    const ch = o.orderType === "app" ? (channelById.get(o.channelId) ?? null) : null;
    const lines = o.lines
      .map((r) => buildLine(r, ch))
      .filter(Boolean)
      .map((l, i) => ({
        ...l,
        discountType: o.lines[i]?.discountType ?? "amount",
        discountValue: o.lines[i]?.discountValue ?? 0,
      }));
    setItems(lines);
    setCustomerId(o.customerId ?? null);
    setOrder({
      orderId: o.id,
      dailyNo: o.dailyNo,
      orderType: o.orderType,
      tableNo: o.tableNo ?? "",
      tableId: o.tableId ?? null,
      partySize: o.partySize ?? null,
      channelId: o.channelId,
      channelOrderNo: o.channelOrderNo ?? "",
      driverId: o.driverId,
      customerName: o.customerName ?? "",
      phone: o.phone ?? "",
      address: o.address ?? "",
    });
    setServicePercent(o.servicePercent);
    setDeliveryFee(o.deliveryFee);
    setSent(lines.map((l) => [sig(l.rest), l.qty]));
    setOrdersOpen(false);
    message.success(t("OrderLoaded", { n: o.dailyNo }));
  };

  // ---------- رأس السلة: نوع الطلب وبياناته ----------
  const typeOptions = [
    { value: "local", label: t("type.local"), icon: <ShopOutlined /> },
    { value: "dinein", label: t("type.dinein"), icon: <TableOutlined /> },
    { value: "takeaway", label: t("type.takeaway"), icon: <ShoppingOutlined /> },
    { value: "delivery", label: t("type.delivery"), icon: <CarOutlined /> },
    ...(restaurant?.channels.length
      ? [{ value: "app", label: t("type.app"), icon: <MobileOutlined /> }]
      : []),
  ];
  const set = (patch) => setOrder((o) => ({ ...o, ...patch }));
  const serviceShown =
    on &&
    order.orderType !== "app" &&
    (!restaurant.settings.serviceDineInOnly ||
      order.orderType === "local" ||
      order.orderType === "dinein");

  const head = on && (
    <div className="rpos-head">
      {/* نوع الطلب: زراير كبيرة متساوية (الاسم كامل، والمختار بلون البرنامج) */}
      <div
        className="rpos-types"
        role="radiogroup"
        style={{ gridTemplateColumns: `repeat(${typeOptions.length}, 1fr)` }}
      >
        {typeOptions.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={order.orderType === o.value}
            disabled={Boolean(order.orderId)}
            className={`rpos-type rpos-type--${o.value}${order.orderType === o.value ? " is-on" : ""}`}
            onClick={() => setType(o.value)}
          >
            {o.icon}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      {order.orderId && (
        <Tag color="purple" className="mt-2">
          {t("EditingOrder", { n: order.dailyNo })}
        </Tag>
      )}
      <div className="rpos-fields">
        {/* الطاولة: من طاولات الفرع (المشغولة عليها رقم طلبها)، أو رقم بالكتابة لو مفيش طاولات */}
        {order.orderType === "dinein" &&
          (restaurant.tables?.length ? (
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t("TableNo")}
              value={order.tableId ?? undefined}
              onChange={(id) => {
                const tb = restaurant.tables.find((x) => x.id === id);
                set({ tableId: id, tableNo: tb?.name ?? "" });
              }}
              options={restaurant.tables.map((tb) => ({
                value: tb.id,
                label:
                  tb.busyNo && tb.busyNo !== order.dailyNo
                    ? t("TableBusy", { name: tb.name, n: tb.busyNo })
                    : t("TableSeats", { name: tb.name, n: tb.seats }),
              }))}
            />
          ) : (
            <Input
              placeholder={t("TableNo")}
              value={order.tableNo}
              onChange={(e) => set({ tableNo: e.target.value })}
              maxLength={20}
              autoComplete="off"
            />
          ))}
        {order.orderType === "app" && (
          <>
            <Select
              placeholder={t("ChooseApp")}
              value={order.channelId ?? undefined}
              onChange={setChannel}
              options={restaurant.channels.map((c) => ({
                value: c.id,
                label: nm(c),
              }))}
            />
            <Input
              placeholder={t("AppOrderNo")}
              value={order.channelOrderNo}
              onChange={(e) => set({ channelOrderNo: e.target.value })}
              maxLength={50}
              autoComplete="off"
            />
          </>
        )}
        {order.orderType !== "app" && (
          <Space.Compact className="rpos-wide" style={{ width: "100%" }}>
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder={t("Customer")}
              style={{ width: "100%" }}
              value={customerId ?? undefined}
              onChange={(v) => {
                setCustomerId(v ?? null);
                // التوصيل: اسم العميل وجواله بيتملوا من بياناته
                const c = customers.find((x) => x.id === v);
                if (c && order.orderType === "delivery")
                  set({
                    customerName: order.customerName || nm(c),
                    phone: order.phone || c.phone || "",
                  });
              }}
              options={customers.map((c) => ({
                value: c.id,
                label: `${c.code} - ${nm(c)}${c.phone ? ` (${c.phone})` : ""}`,
              }))}
            />
            {/* تسجيل عميل جديد من غير ما تسيب الكاشير */}
            <QuickAddParty
              kind="customers"
              onCreated={(c) => {
                onCustomerCreated?.(c);
                setCustomerId(c.id);
                if (order.orderType === "delivery")
                  set({ customerName: nm(c), phone: c.phone || "" });
              }}
            />
          </Space.Compact>
        )}
        {order.orderType === "delivery" && (
          <>
            <Input
              placeholder={t("CustomerName")}
              value={order.customerName}
              onChange={(e) => set({ customerName: e.target.value })}
              maxLength={150}
              autoComplete="off"
            />
            <Input
              placeholder={t("Phone")}
              dir="ltr"
              inputMode="tel"
              value={order.phone}
              onChange={(e) => set({ phone: e.target.value })}
              maxLength={30}
              autoComplete="off"
            />
            <Input
              placeholder={t("Address")}
              value={order.address}
              onChange={(e) => set({ address: e.target.value })}
              maxLength={500}
              autoComplete="off"
              className="rpos-wide"
            />
            <Select
              allowClear
              placeholder={t("Driver")}
              value={order.driverId ?? undefined}
              onChange={(v) => set({ driverId: v ?? null })}
              options={restaurant.drivers.map((d) => ({
                value: d.id,
                label: d.name,
              }))}
            />
            <InputNumber
              min={0}
              prefix={t("DeliveryFee")}
              value={deliveryFee}
              onChange={(v) => setDeliveryFee(v ?? 0)}
              style={{ width: "100%" }}
            />
          </>
        )}
        {serviceShown && (
          <InputNumber
            min={0}
            max={restaurant.settings.serviceType === "percent" ? 100 : undefined}
            prefix={t("Service")}
            suffix={restaurant.settings.serviceType === "percent" ? "%" : undefined}
            value={servicePercent}
            onChange={(v) => setServicePercent(v ?? 0)}
            style={{ width: "100%" }}
          />
        )}
      </div>
    </div>
  );

  // الصنف بالوزن (السمك): الكمية بكسور + عدد الحبات
  const isWeighed = (l) => Boolean(itemById.get(l.rest?.productId)?.askPieces);

  // ---------- سطر في السلة ----------
  const renderLine = (l, { lastKey, onQty, onRemove }) => {
    if (isFeeLine(l))
      return (
        <div key={l.key} className="pos-line rpos-fee">
          <div>
            <div className="pos-line__name">{nm(l)}</div>
          </div>
          <div className="pos-line__total">{money(l.total)}</div>
        </div>
      );
    return (
      <div
        key={l.key}
        className={`pos-line ${l.key === lastKey ? "is-last" : ""}`}
      >
        <div>
          <div className="pos-line__name">{nm(l)}</div>
          {l.rest.note && <div className="pos-line__meta">{l.rest.note}</div>}
        </div>
        <div className="pos-line__total">{money(l.total)}</div>
        <div className="pos-line__controls">
          <span className="pos-qty">
            <Button
              className="pos-qty__minus"
              icon={<MinusOutlined />}
              aria-label={t("Decrease")}
              onClick={() =>
                l.qty <= 1 ? onRemove(l.key) : onQty(l.key, qtyStep(l.qty, -1))
              }
            />
            {/* الكمية: بكسور للأصناف بالوزن بس (كيلو ونص سمك = 1.5) */}
            <InputNumber
              min={isWeighed(l) ? 0.001 : 1}
              max={999}
              precision={isWeighed(l) ? 3 : 0}
              formatter={isWeighed(l) ? fmtQty : undefined}
              controls={false}
              value={l.qty}
              onFocus={(e) => e.target.select()}
              onChange={(v) => onQty(l.key, v > 0 ? v : 1)}
            />
            <Button
              className="pos-qty__plus"
              icon={<PlusOutlined />}
              aria-label={t("Increase")}
              onClick={() => onQty(l.key, qtyStep(l.qty, 1))}
            />
          </span>
          <span className="pos-line__meta">
            × <bdi>{money(l.price)}</bdi>
          </span>
          <Button
            icon={<EditOutlined />}
            aria-label={t("EditLine")}
            title={t("EditLine")}
            onClick={() => {
              const item = itemById.get(l.rest.productId);
              if (item) setPicking({ item, line: l });
            }}
          />
          <span style={{ flex: 1 }} />
          <Button
            className="pos-line__delete"
            icon={<DeleteOutlined />}
            aria-label={t("Remove")}
            onClick={() => onRemove(l.key)}
          />
        </div>
      </div>
    );
  };

  // ---------- المنيو (بدل شبكة الأصناف) ----------
  // الأقسام اللي فيها أصناف في المنيو بس
  const cats = useMemo(() => {
    const used = new Set((restaurant?.items ?? []).map((i) => i.categoryId));
    return categories.filter((c) => used.has(c.id));
  }, [restaurant, categories]);
  const shown = useMemo(() => {
    // الفلترة وانت بتكتب (من أول حرف)
    const s = q.trim().toLowerCase();
    return (restaurant?.items ?? []).filter(
      (i) =>
        (cat === "all" || i.categoryId === cat) &&
        (!s ||
          [i.product.code, i.product.arName, i.product.enName].some((v) =>
            String(v ?? "")
              .toLowerCase()
              .includes(s),
          )),
    );
  }, [restaurant, cat, q]);

  const tilePrice = (i) => {
    const prices = i.sizes.length ? i.sizes.map((s) => s.price) : [i.price];
    const min = Math.min(
      ...prices.map((p) =>
        linePrice({ ...i, price: p, sizes: [] }, 0, [], channel),
      ),
    );
    return i.sizes.length ? `${t("From")} ${money(min)}` : money(min);
  };

  const catalog = on && (
    <div className="pos-catalog">
      <div className="rpos-search">
        <SearchBox
          placeholder={t("SearchMenu")}
          value={q}
          onChange={setQ}
          onSearch={setQ}
        />
      </div>
      <div className="pos-cats">
        <div
          role="button"
          tabIndex={0}
          className={`pos-cat ${cat === "all" ? "is-active" : ""}`}
          onClick={() => setCat("all")}
          onKeyDown={(e) => e.key === "Enter" && setCat("all")}
        >
          {t("All")}
        </div>
        {cats.map((c) => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            className={`pos-cat ${cat === c.id ? "is-active" : ""}`}
            onClick={() => setCat(c.id)}
            onKeyDown={(e) => e.key === "Enter" && setCat(c.id)}
          >
            {nm(c)}
          </div>
        ))}
      </div>
      <div className="pos-grid">
        {shown.length ? (
          shown.map((i) => (
            <div
              key={i.productId}
              role="button"
              tabIndex={0}
              className="pos-tile"
              onClick={() => pickItem(i)}
              onKeyDown={(e) => e.key === "Enter" && pickItem(i)}
            >
              <div className="pos-tile__img">
                {i.product.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl(i.product.image)} alt="" />
                ) : (
                  <CoffeeOutlined />
                )}
              </div>
              <div className="pos-tile__name">{nm(i.product)}</div>
              <div className="pos-tile__price">{tilePrice(i)}</div>
            </div>
          ))
        ) : (
          <div className="pos-more" style={{ color: C.muted }}>
            {t("NoMenuItems")}
          </div>
        )}
      </div>
    </div>
  );

  const ticketLabels = {
    types: {
      local: t("type.local"),
      dinein: t("type.dinein"),
      takeaway: t("type.takeaway"),
      delivery: t("type.delivery"),
      app: t("type.app"),
    },
    table: t("Table"),
    added: t("AddedItems"),
  };

  // مقاس ورق التذكرة: ورق طابعتها، وإلا ورق إعدادات الفواتير
  const ticketPaper =
    (ticket?.paperSize ?? printSettings?.paperSize) === "58mm" ? "58mm" : "80mm";

  const modals = on && (
    <>
      {picking && (
        <ItemPickModal
          item={picking.item}
          line={picking.line}
          groupById={groupById}
          sizeById={sizeById}
          channel={channel}
          onClose={() => setPicking(null)}
          onSave={(rest) => {
            putLine(rest, picking.line);
            setPicking(null);
          }}
        />
      )}
      {ordersOpen && (
        <OrdersModal
          channelById={channelById}
          onLoad={loadOrder}
          describeLines={describeLines}
          describeSale={describeSale}
          onPrintTicket={printOrderTicket}
          onReprintSale={reprintSale}
          onPendingChange={setPending}
          onClose={() => setOrdersOpen(false)}
        />
      )}
      {ticket && (
        <PrintDocument
          key={ticket.qid}
          paperSize={ticketPaper}
          onDone={() => setTickets((q) => q.slice(1))}
        >
          <KitchenTicket
            ticket={ticket}
            paperSize={ticketPaper}
            labels={ticketLabels}
          />
        </PrintDocument>
      )}
      {/* وسيط الطباعة: التذاكر والفاتورة على طابعاتها من غير نوافذ */}
      <AgentPrinter
        items={agentQueue}
        onDone={(it) => setAgentQueue((q) => q.filter((x) => x.key !== it.key))}
        onFallback={(it) => (it.part ? toBrowser(it.part) : it.fallback?.())}
      />
    </>
  );

  return {
    on,
    head,
    catalog,
    modals,
    renderLine,
    feeLines,
    checkoutPayload,
    validate,
    canSaveTable,
    saveTable,
    saving,
    afterPaid,
    flushTicket,
    reset,
    order,
    openOrders: () => setOrdersOpen(true),
    printReceipt,
    pending,
  };
}

// ============================================================
// نافذة الصنف: الحجم + الإضافات + الكمية + ملاحظة
// ============================================================
function ItemPickModal({ item, line, groupById, sizeById, channel, onClose, onSave }) {
  const t = useTranslations("RestaurantPos");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const groups = item.groupIds.map((id) => groupById.get(id)).filter(Boolean);
  const [sizeId, setSizeId] = useState(
    line?.rest.sizeId || item.sizes[0]?.sizeId || 0,
  );
  const [mods, setMods] = useState(line?.rest.modifierIds ?? []);
  const [qty, setQty] = useState(line?.qty ?? 1);
  const [notes, setNotes] = useState(line?.rest.notes ?? "");
  // عدد الحبات (السمك...): الكيلو كام حبة
  const [pieces, setPieces] = useState(line?.rest.pieces ?? null);

  const toggle = (g, id) =>
    setMods((prev) => {
      const inGroup = prev.filter((m) => g.modifiers.some((x) => x.id === m));
      if (prev.includes(id)) return prev.filter((m) => m !== id);
      // اختيار واحد: يستبدل اللي قبله
      if (g.maxSelect === 1)
        return [...prev.filter((m) => !inGroup.includes(m)), id];
      if (g.maxSelect && inGroup.length >= g.maxSelect) return prev;
      return [...prev, id];
    });

  const missing = groups.find((g) => {
    const c = mods.filter((m) => g.modifiers.some((x) => x.id === m)).length;
    return c < Math.min(g.minSelect, g.modifiers.length);
  });
  const chosen = groups.flatMap((g) => g.modifiers.filter((m) => mods.includes(m.id)));
  const unit = linePrice(item, sizeId, chosen, channel);

  const rule = (g) =>
    g.minSelect > 0
      ? g.maxSelect === 1
        ? t("ChooseOne")
        : t("ChooseMin", { n: g.minSelect })
      : g.maxSelect
        ? t("ChooseUpTo", { n: g.maxSelect })
        : t("Optional");

  return (
    <Modal
      open
      width={640}
      title={nm(item.product)}
      onCancel={onClose}
      okText={`${line ? t("Update") : t("Add")} — ${money(unit * qty)}`}
      okButtonProps={{ disabled: Boolean(missing), size: "large" }}
      onOk={() =>
        onSave({
          productId: item.productId,
          sizeId,
          modifierIds: mods,
          notes: notes.trim(),
          pieces: item.askPieces ? pieces || null : null,
          qty,
        })
      }
      destroyOnHidden
    >
      {item.sizes.length > 0 && (
        <div className="rpos-block">
          <div className="rpos-block__title">{t("Size")}</div>
          <div className="rpos-chips">
            {item.sizes.map((s) => (
              <button
                key={s.sizeId}
                type="button"
                className={`rpos-chip ${sizeId === s.sizeId ? "is-on" : ""}`}
                onClick={() => setSizeId(s.sizeId)}
              >
                <b>{nm(sizeById.get(s.sizeId))}</b>
                <small>{money(linePrice(item, s.sizeId, [], channel))}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.id} className="rpos-block">
          <div className="rpos-block__title">
            {nm(g)}{" "}
            <Tag color={g.minSelect > 0 ? "orange" : undefined}>{rule(g)}</Tag>
          </div>
          <div className="rpos-chips">
            {g.modifiers.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`rpos-chip ${mods.includes(m.id) ? "is-on" : ""}`}
                onClick={() => toggle(g, m.id)}
              >
                <b>{nm(m)}</b>
                {m.price > 0 && <small>+{money(m.price)}</small>}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="rpos-block">
        <div className="rpos-block__title">{t("Qty")}</div>
        <Space.Compact size="large" className="rpos-qty">
          <Button
            className="rpos-qty__btn"
            aria-label={t("Decrease")}
            icon={<MinusOutlined />}
            onClick={() => setQty((v) => (v > 1 ? qtyStep(v, -1) : v))}
          />
          <InputNumber
            min={item.askPieces ? 0.001 : 1}
            max={999}
            precision={item.askPieces ? 3 : 0}
            formatter={item.askPieces ? fmtQty : undefined}
            controls={false}
            value={qty}
            onChange={(v) => setQty(v > 0 ? v : 1)}
            style={{ width: 80, textAlign: "center" }}
          />
          <Button
            className="rpos-qty__btn"
            aria-label={t("Increase")}
            icon={<PlusOutlined />}
            onClick={() => setQty((v) => qtyStep(v, 1))}
          />
        </Space.Compact>
      </div>
      {item.askPieces && (
        <div className="rpos-block">
          <div className="rpos-block__title">{t("Pieces")}</div>
          <InputNumber
            size="large"
            min={1}
            max={99}
            precision={0}
            value={pieces}
            onChange={setPieces}
            placeholder={t("PiecesHint")}
            style={{ width: 200 }}
          />
        </div>
      )}
      <Input
        placeholder={t("LineNotes")}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={200}
        autoComplete="off"
      />
      {missing && (
        <div style={{ color: C.warningText, marginTop: 8 }}>
          {t("ChooseFrom", { name: nm(missing) })}
        </div>
      )}
    </Modal>
  );
}

// ============================================================
// طلبات اليوم: المفتوحة (الطاولات) للتحميل والإلغاء + البحث برقم الطلب / الطاولة
// ============================================================
function OrdersModal({
  channelById,
  onLoad,
  describeLines,
  describeSale,
  onPrintTicket,
  onReprintSale,
  onPendingChange,
  onClose,
}) {
  const t = useTranslations("RestaurantPos");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  // تفاصيل الطلب المدفوع (سطور فاتورته) بتتجاب أول ما الصف يتفتح
  const [sales, setSales] = useState({});

  const saleOf = async (o) => {
    if (sales[o.saleId]) return sales[o.saleId];
    const res = await getSaleAction(o.saleId);
    if (!res.success || !res.data) {
      showActionError(res, tAlerts, locale);
      return null;
    }
    setSales((m) => ({ ...m, [o.saleId]: res.data }));
    return res.data;
  };
  const linesOf = (o) =>
    o.status === "open" || o.status === "pending"
      ? describeLines(o.lines)
      : sales[o.saleId]
        ? describeSale(sales[o.saleId])
        : null;
  const ticketFor = async (o) => {
    if (o.status === "open" || o.status === "pending")
      return onPrintTicket(o, describeLines(o.lines));
    const sale = await saleOf(o);
    if (sale) onPrintTicket(o, describeSale(sale));
  };

  const load = async (text = q) => {
    setLoading(true);
    const res = await restaurantOrdersAction({ q: text });
    setLoading(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    setRows(res.data);
    // العداد: الطلبات اللي لسه مخلصتش (جديد + مفتوح)، بيفضل لحد الحساب أو الإلغاء
    onPendingChange?.(
      res.data.filter((o) => o.status === "pending" || o.status === "open").length,
    );
  };

  // قبول الطلب الأونلاين: يبقى مفتوح للحساب + تذكرة المطبخ
  const accept = async (o) => {
    const res = await acceptOnlineOrderAction(o.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("OrderAccepted", { n: o.dailyNo }));
    onPrintTicket(o, describeLines(o.lines));
    load();
  };
  const reject = (o) =>
    modal.confirm({
      title: t("ConfirmReject", { n: o.dailyNo }),
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await rejectOnlineOrderAction(o.id);
        if (!res.success) return showActionError(res, tAlerts, locale);
        message.success(t("OrderRejected"));
        load();
      },
    });
  // أول ما النافذة تتفتح
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = (o) =>
    modal.confirm({
      title: t("ConfirmCancelOrder", { n: o.dailyNo }),
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await cancelOpenOrderAction(o.id);
        if (!res.success) return showActionError(res, tAlerts, locale);
        message.success(t("OrderCancelled"));
        load();
      },
    });

  const statusTag = (s) =>
    s === "pending" ? (
      <Tag color="red">{t("status.pending")}</Tag>
    ) : s === "open" ? (
      <Tag color="orange">{t("status.open")}</Tag>
    ) : s === "paid" ? (
      <Tag color="green">{t("status.paid")}</Tag>
    ) : (
      <Tag>{t("status.cancelled")}</Tag>
    );

  const openCount = (rows ?? []).filter((o) => o.status === "open").length;

  return (
    <Modal
      open
      width={820}
      title={
        <Space>
          {t("Orders")}
          <Badge count={openCount} />
        </Space>
      }
      footer={null}
      onCancel={onClose}
      destroyOnHidden
    >
      <div className="mb-3">
        <SearchBox
          placeholder={t("SearchOrders")}
          value={q}
          onChange={setQ}
          onSearch={(v) => load(v)}
          loading={loading}
        />
      </div>
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={rows ?? []}
        pagination={false}
        scroll={{ x: 760, y: 420 }}
        expandable={{
          // تفاصيل الطلب: الأصناف (والمدفوع من فاتورته)
          onExpand: (open, o) => {
            if (open && o.status === "paid" && o.saleId) saleOf(o);
          },
          expandedRowRender: (o) => {
            const lines = linesOf(o);
            if (!lines) return <Spin size="small" />;
            if (!lines.length) return <span style={{ color: C.muted }}>—</span>;
            return (
              <div className="rpos-order-lines">
                {lines.map((l, i) => (
                  <div key={i}>
                    <b>{l.qty} ×</b> {l.name}
                    {l.note && <span className="rpos-order-lines__note"> · {l.note}</span>}
                  </div>
                ))}
              </div>
            );
          },
        }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("NoOrders")}
            />
          ),
        }}
        columns={[
          {
            title: t("OrderNo"),
            dataIndex: "dailyNo",
            width: 80,
            render: (v) => <b style={{ fontSize: 16 }}>#{v}</b>,
          },
          {
            title: t("OrderType"),
            render: (_, o) => (
              <span>
                {t(`type.${o.orderType}`)}
                {o.tableNo ? ` — ${t("Table")} ${o.tableNo}` : ""}
                {o.partySize ? ` · ${t("PartyN", { n: o.partySize })}` : ""}
                {o.channelId ? ` — ${nm(channelById.get(o.channelId) ?? o.channel)}` : ""}
                {o.source === "online" && (
                  <div className="rpos-online-info">
                    <Tag color="geekblue">{t("Online")}</Tag>
                    {o.pickupAt && (
                      <b>
                        {new Date(o.pickupAt).toLocaleTimeString("en-GB", {
                          timeZone: "Asia/Riyadh",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </b>
                    )}
                    {o.pickupMode === "car" ? (
                      <span> · {t("mode.car")}{o.carInfo ? `: ${o.carInfo}` : ""}</span>
                    ) : (
                      <span> · {t("mode.store")}</span>
                    )}
                    <div>
                      {o.customerName} · <bdi dir="ltr">{o.phone}</bdi>
                    </div>
                    {o.notes && <div className="rpos-order-lines__note">{o.notes}</div>}
                  </div>
                )}
                {o.driver ? (
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    {t("Driver")}: {o.driver.name}
                  </div>
                ) : null}
              </span>
            ),
          },
          {
            title: t("Total"),
            dataIndex: "total",
            width: 110,
            render: (v) => <b>{money(v)}</b>,
          },
          {
            title: t("Status"),
            dataIndex: "status",
            width: 100,
            render: statusTag,
          },
          {
            title: "",
            width: 300,
            render: (_, o) => (
              <Space size={4} wrap>
                {o.status === "pending" && (
                  <>
                    <Button
                      type="primary"
                      size="small"
                      className="rpos-accept"
                      onClick={() => accept(o)}
                    >
                      {t("Accept")}
                    </Button>
                    <Button size="small" danger onClick={() => reject(o)}>
                      {t("Reject")}
                    </Button>
                  </>
                )}
                {o.status === "open" && (
                  <Button
                    type="primary"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => onLoad(o)}
                  >
                    {t("EditOrPay")}
                  </Button>
                )}
                {o.status !== "cancelled" && (
                  <Button
                    size="small"
                    icon={<PrinterOutlined />}
                    onClick={() => ticketFor(o)}
                  >
                    {t("PrintPrep")}
                  </Button>
                )}
                {o.status === "paid" && o.saleId && onReprintSale && (
                  <Button
                    size="small"
                    icon={<FileTextOutlined />}
                    onClick={() => {
                      onReprintSale(o.saleId);
                      onClose();
                    }}
                  >
                    {t("PrintInvoice")}
                  </Button>
                )}
                {o.status === "open" && (
                  <Button size="small" danger onClick={() => cancel(o)}>
                    {t("Cancel")}
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />
    </Modal>
  );
}
