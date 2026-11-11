"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Empty,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import {
  AppstoreOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  ClearOutlined,
  DeleteOutlined,
  FullscreenOutlined,
  HistoryOutlined,
  LockOutlined,
  SwapOutlined,
  MinusOutlined,
  PauseCircleOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ShoppingCartOutlined,
  TagOutlined,
  GiftOutlined,
  RollbackOutlined,
  SaveOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { calcInvoice, round } from "@/lib/invoice-calc";
import { applyPromotions } from "@/lib/promotions";
import { imageUrl } from "@/lib/image";
import { formatDocNo, saleDocNo } from "@/lib/doc-number";
import { formatDateTime } from "@/lib/dates";
import {
  browseSaleProductsAction,
  createSaleAction,
  getSaleAction,
  searchSaleProductsAction,
} from "@/actions/sale.actions";
import NextDocNo from "@/components/common/NextDocNo";
import { message } from "@/components/common/feedback";
import { addBatchPick, useExpiryWarning } from "@/components/batches/expiryWarning";
import { showActionError } from "@/components/common/actionError";
import { useSaveKey } from "@/components/common/useSaveKey";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCan } from "@/components/auth/AuthProvider";
import ProductPicker from "@/components/purchases/ProductPicker";
import DiscountInput from "@/components/purchases/DiscountInput";
import PrintDocument from "@/components/printing/PrintDocument";
import { bookingLines, lineFromProduct } from "@/components/sales/SaleForm";
import { useModule, useModuleSettings } from "@/components/auth/AuthProvider";
import LineSerials, {
  serialInLines,
  serialsShort,
} from "@/components/serials/LineSerials";
import SaleDocument from "@/components/sales/SaleDocument";
import {
  CashMovementModal,
  CloseShiftModal,
  OpenShiftModal,
} from "@/components/sales/ShiftModals";
import PayModal from "./PayModal";
import {
  editLines,
  isEditableOrder,
  isLaundryLine,
  orderLines,
  useLaundryPos,
} from "@/components/laundry/useLaundryPos";
import { laundryCheckoutAction } from "@/actions/laundry-order.actions";
import {
  isFeeLine,
  isRestaurantLine,
  useRestaurantPos,
} from "@/components/restaurant/useRestaurantPos";
import { restaurantCheckoutAction } from "@/actions/restaurant-pos.actions";
import LaundryReturnModal from "@/components/laundry/LaundryReturnModal";
import { useWaMessages } from "@/components/laundry/WhatsAppSend";
import { openWhatsApp } from "@/lib/whatsapp";

// واتساب تلقائي (المغسلة): بيتحفظ على الجهاز
const WA_AUTO_KEY = "laundry-wa-auto";
import "@/components/purchases/purchases.css";
import "./pos.css";
import QuickAddParty from "@/components/parties/QuickAddParty";
import PreviewBeforeSave from "@/components/printing/PreviewBeforeSave";
import { previewItems, previewTotals } from "@/lib/preview-doc";
import CustomerB2BAlert from "@/components/zatca/CustomerB2BAlert";
import ScanSafeNumber from "@/components/common/ScanSafeNumber";
import { lineQtyProblem, qtyProblemKey } from "@/lib/unit-qty";
import { LoyaltyHint, useLoyalty } from "@/components/promotions/useLoyalty";
import PosSalesModal from "./PosSalesModal";
import SizePickerModal from "@/components/products/SizePickerModal";
import { ColorDot } from "@/components/products/VariantsFields";
import LineConversion from "@/components/common/LineConversion";
import PosBookingsModal, {
  CustomerBookingHint,
} from "@/components/bookings/PosBookingsModal";
import StaffSelect, {
  useStaffOnPos,
} from "@/components/technicians/StaffSelect";
import { C } from "@/lib/theme";
import { useStockElsewhere } from "@/components/common/useStockElsewhere";

const PAGE_SIZE = 60;

// الفواتير المعلّقة: تُحفظ في المتصفح (لكل مستخدم)
const heldKey = (userId) => `pos-held-${userId}`;
const readHeld = (userId) => {
  try {
    return JSON.parse(localStorage.getItem(heldKey(userId)) || "[]");
  } catch {
    return [];
  }
};
const writeHeld = (userId, list) => {
  try {
    localStorage.setItem(heldKey(userId), JSON.stringify(list));
  } catch {
    /* المتصفح لا يسمح بالتخزين: التعليق يعمل في الجلسة الحالية فقط */
  }
};

// ============================================================
// شاشة الكاشير (POS)
// - بالماسح أو البحث، أو من الأقسام: الرئيسي ← الفرعي ← الأصناف بالصور
// - الصنف بأكثر من وحدة (حبة / شدة / كرتونة): نختار الوحدة بسعرها
// - تعليق الفاتورة واسترجاعها، خصم (بصلاحية)، دفع سريع بالباقي للعميل
// - لازم وردية مفتوحة، والإيصال يُطبع تلقائياً بعد الدفع
// ============================================================
// الكمية المطلوبة من صنف في السطور كلها (بالوحدة الأساسية) + اللي هيتضاف
const neededBase = (lines, product, unitId, addQty) => {
  const f = (units, uid) => units?.find((u) => u.unit.id === uid)?.factor ?? 1;
  return (
    lines
      .filter((l) => l.productId === product.id)
      .reduce((s, l) => s + Number(l.qty || 0) * f(l.units, l.unitId), 0) +
    addQty * f(product.units, unitId)
  );
};

export default function PosScreen({
  user,
  branch,
  shift: initialShift,
  categories = [],
  customers: customersProp = [],
  methods = [],
  creditMethod = null,
  perms = {},
  promotions = [],
  company,
  printSettings,
  // فاتورة من حجز (الخدمات بمقدم الخدمة + العميل)
  booking = null,
  // المغسلة (وحدة laundry): القطع والخدمات والإضافات + طلبات محمّلة للفوترة
  laundry = null,
  laundryOrders = [],
  // طلب للتعديل (?editOrder=id من شاشة الطلبات)
  laundryEdit = null,
  // المطعم (وحدة restaurant): المنيو بأحجامه وإضافاته والتطبيقات والسائقين والرسوم
  restaurant = null,
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Pos");
  const tZ = useTranslations("Zatca");
  const tS = useTranslations("Sales");
  const tB = useTranslations("Bookings");
  // رصيد فرعك مش كفاية ← تنبيه بالفروع اللي فيها الصنف
  const stockElsewhere = useStockElsewhere();
  const tAlerts = useTranslations("Alerts");
  const tSerial = useTranslations("Serials");
  const warnExpiry = useExpiryWarning();
  const tButtons = useTranslations("Buttons");
  const tL = useTranslations("Laundry");
  const tR = useTranslations("RestaurantPos");
  const { amount: money, decimals, symbol } = useCurrency();
  // بصمة الحفظ: الضغط على حفظ مرتين (أو بعد ما الرد يضيع) مايكررش المستند
  const saveKey = useSaveKey();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const [shift, setShift] = useState(initialShift);
  const [closingShift, setClosingShift] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const can = useCan();
  const canDrawer = can("shifts.cashMovement");

  // ---------- السلة ----------
  const [items, setItems] = useState(() =>
    booking
      ? bookingLines(booking)
      : laundryOrders.length
        ? orderLines(laundryOrders, laundry)
        : isEditableOrder(laundryEdit)
          ? editLines(laundryEdit, laundry)
          : [],
  );
  const [lastKey, setLastKey] = useState(null);
  const [customerId, setCustomerId] = useState(
    booking?.customerId ??
      laundryOrders[0]?.customerId ??
      (isEditableOrder(laundryEdit) ? laundryEdit.customerId : null),
  );
  // الحجز اللي الفاتورة دي بتاعته (بيتمسح بعد الحفظ أو تفريغ السلة)
  const [bookingId, setBookingId] = useState(booking?.id ?? null);
  const [bookingNo, setBookingNo] = useState(booking?.number ?? null);
  // البحث عن حجز وتحويله لفاتورة من الكاشير نفسه (F6)
  const bookingsOn = useModule("bookings");
  const [bookingsOpen, setBookingsOpen] = useState(false);
  // فواتير سابقة: عرض وإعادة طباعة (في كل الأنشطة) - F7
  const [salesOpen, setSalesOpen] = useState(false);
  // مقدم الخدمة (العاملة / الحلاق): الافتراضي للأصناف الجديدة، ويتغير لكل سطر
  const staffOn = useStaffOnPos();
  const [staffId, setStaffId] = useState(booking?.technicianId ?? null);
  // الإضافة السريعة: الجديد بيظهر في القائمة على طول (قبل ما الصفحة تتحدث)
  const [addedParties, setAddedParties] = useState([]);
  const customers = useMemo(() => {
    const ids = new Set(customersProp.map((x) => x.id));
    return [...customersProp, ...addedParties.filter((x) => !ids.has(x.id))];
  }, [customersProp, addedParties]);
  const [discount, setDiscount] = useState({ type: "amount", value: 0 });
  const [discountOpen, setDiscountOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [unitPick, setUnitPick] = useState(null);
  // المقاسات (وحدة variants): رقم الموديل اللي شبكة مقاساته مفتوحة
  const [sizePick, setSizePick] = useState(null);
  // السطر اللي نافذة أرقامه التسلسلية مفتوحة (بتتفتح أول ما الصنف المتتبع يتضاف)
  const [serialKey, setSerialKey] = useState(null);
  const serialsOn = useModule("serials");
  const { serialRequired = false } = useModuleSettings();
  const [held, setHeld] = useState([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [lastSale, setLastSale] = useState(null);
  // المغسلة: مرتجع فاتورة من نفس الشاشة
  const [returnOpen, setReturnOpen] = useState(false);
  const waMsg = useWaMessages();
  // الفاتورة اللي هتتبعت على واتساب بعد ما طباعتها تخلص
  const waAfterPrint = useRef(null);
  // واتساب تلقائي: بعد الفاتورة / الطلب محادثة العميل بتفتح لوحدها (بيتحفظ على الجهاز)
  const [waAuto, setWaAuto] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWaAuto(localStorage.getItem(WA_AUTO_KEY) === "1");
    } catch {
      /* المتصفح مانع التخزين */
    }
  }, []);
  const toggleWaAuto = (on) => {
    setWaAuto(on);
    try {
      localStorage.setItem(WA_AUTO_KEY, on ? "1" : "0");
    } catch {
      /* المتصفح مانع التخزين */
    }
  };
  // بعد الطباعة (لو التلقائي شغال): محادثة العميل بتفتح بالرسالة
  // (بعد ما نافذة الطباعة تتقفل، مش قبلها)
  const sendWa = (target) => {
    if (!waAuto || !target) return;
    const phone =
      target.kind === "sale" ? target.doc.customer?.phone : target.order.phone;
    if (!phone) return;
    const text =
      target.kind === "sale" ? waMsg.invoice(target.doc) : waMsg.order(target.order);
    if (!openWhatsApp(phone, text)) message.warning(tL("WaPopupBlocked"));
  };

  useEffect(() => setHeld(readHeld(user.id)), [user.id]);

  // وضع المغسلة: الكاشير بيبقى شاشة المغسلة (القطع، الطلبات، الجوال)
  const lp = useLaundryPos({
    laundry,
    initialOrders: laundryOrders,
    editOrder: laundryEdit,
    items,
    setItems,
    setCustomerId,
    setLastKey,
    printSettings,
    methods,
    customers,
  });

  // وضع المطعم: نوع الطلب والمنيو والرسوم (كله على وردية الكاشير)
  const rp = useRestaurantPos({
    restaurant,
    items,
    setItems,
    setLastKey,
    customerId,
    setCustomerId,
    customers,
    shift,
    printSettings,
    categories,
    // عميل جديد من رأس سلة المطعم
    onCustomerCreated: (c) => setAddedParties((prev) => [...prev, c]),
    // طلب مدفوع: إعادة طباعة فاتورته من نافذة الطلبات
    reprintSale: async (saleId) => {
      const full = await getSaleAction(saleId);
      if (!full.success || !full.data)
        return showActionError(full, tAlerts, locale);
      if (!printSettings) return message.warning(tR("NoPrintSettings"));
      printSale(full.data);
    },
  });

  // الفاتورة: المطعم على طابعة الكاشير عن طريق وسيط الطباعة (من غير نافذة)،
  // ولو مفيش وسيط / طابعة: نافذة الطباعة زي الأول
  const printSale = (doc) => {
    if (!rp.on) return setReceipt(doc);
    const viaAgent = rp.printReceipt({
      title: `${tR("Invoice")} ${doc.number ?? ""}`.trim(),
      render: (paper) => (
        <SaleDocument
          settings={{ ...printSettings, paperSize: paper }}
          company={company}
          doc={doc}
          kind="sale"
        />
      ),
      fallback: () => setReceipt(doc),
    });
    // الفاتورة راحت للوسيط ← تذاكر المطبخ على طول (من غير ما تستنى نافذة الطباعة)
    if (viaAgent) rp.flushTicket();
  };

  // عروض الولاء للعميل (كل كام مرة ← مرة مجانية)
  const loyalty = useLoyalty(customerId, promotions);

  // العروض الشغالة بتنزل لوحدها (نفس حساب السيرفر)
  const { lines, totals, invoicePromo, loyaltyInfo } = useMemo(() => {
    const applied = applyPromotions({
      // المطعم: سطور الرسوم (الخدمة / التوصيل / التبغ) محسوبة مع السلة
      items: rp.feeLines.length ? [...items, ...rp.feeLines] : items,
      promos: promotions,
      discountType: discount.type,
      discountValue: discount.value,
      decimals,
      loyalty,
    });
    return {
      ...calcInvoice({
        items: applied.items,
        taxMode: "exclusive",
        discountType: applied.discountType,
        discountValue: applied.discountValue,
        decimals,
      }),
      invoicePromo: applied.invoicePromo,
      loyaltyInfo: applied.loyaltyInfo,
    };
  }, [items, rp.feeLines, discount, decimals, promotions, loyalty]);
  const count = items.reduce((s, l) => s + Number(l.qty || 0), 0);

  const focusSearch = () =>
    setTimeout(() => document.querySelector(".pos-search input")?.focus(), 30);

  // serial: الرقم التسلسلي اللي اتمسح (القطعة بتتضاف برقمها من غير نافذة)
  // batch: الدفعة اللي اتمسحت (باركود GS1)
  const addLine = useCallback(
    (product, unitId, qty = 1, serial = null, batch = null) => {
      const tracked = serialsOn && product.serialCount > 0;
      if (serial && serialInLines(items, product.id, serial.serial)) {
        message.warning(tSerial("DuplicateInList"));
        return;
      }
      stockElsewhere.check(product, neededBase(items, product, unitId, qty));
      // تتبع الصلاحية: تنبيه المنتهي / القريب من الانتهاء
      warnExpiry(product, batch);
      setItems((prev) => {
        const found = prev.find(
          (l) => l.productId === product.id && l.unitId === unitId,
        );
        if (found) {
          setLastKey(found.key);
          if (tracked && !serial) setSerialKey(found.key);
          return prev.map((l) =>
            l === found
              ? {
                  ...l,
                  qty: round(l.qty + qty, 3),
                  ...(serial
                    ? { serials: [...(l.serials ?? []), serial] }
                    : {}),
                  ...(batch
                    ? { batchIds: addBatchPick(l.batchIds, batch, qty) }
                    : {}),
                }
              : l,
          );
        }
        const line = lineFromProduct(product, unitId, qty);
        if (serial) line.serials = [serial];
        if (batch) line.batchIds = addBatchPick([], batch, qty);
        if (staffOn && staffId) line.job = { technicianId: staffId };
        setLastKey(line.key);
        if (tracked && !serial) setSerialKey(line.key);
        return [...prev, line];
      });
    },
    [serialsOn, items, tSerial, staffOn, staffId, stockElsewhere, warnExpiry],
  );

  // من الماسح/البحث: الوحدة معروفة (باركودها) أو الأولى
  // باركود الميزان: options.qty = الوزن من الباركود
  const addFromPicker = (product, unitId, options) =>
    product.sizePick
      ? setSizePick(product.sizePick)
      : addLine(
          product,
          unitId ?? product.exactUnitId ?? product.units[0].unit.id,
          options?.qty > 0 ? options.qty : 1,
          options?.serial ?? null,
          options?.batch ?? null,
        );

  // من كارت الصنف: لو له أكثر من وحدة نسأل عن الوحدة
  const addFromTile = (product) => {
    if (product.sizePick) return setSizePick(product.sizePick);
    if (product.units.length > 1) return setUnitPick(product);
    addLine(product, product.units[0].unit.id);
  };

  const factorOfLine = (l) =>
    l.units.find((u) => u.unit.id === l.unitId)?.factor ?? 1;
  const updateLine = (key, patch) =>
    setItems((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  const removeLine = (key) =>
    setItems((prev) => prev.filter((l) => l.key !== key));
  const changeUnit = (line, unitId) => {
    const unit = line.units.find((u) => u.unit.id === unitId);
    updateLine(line.key, { unitId, price: unit.price, listPrice: unit.price });
  };

  const clearCart = () => {
    setItems([]);
    stockElsewhere.reset();
    setBookingId(null);
    setBookingNo(null);
    setCustomerId(null);
    setDiscount({ type: "amount", value: 0 });
    setLastKey(null);
    lp.reset();
    rp.reset();
    focusSearch();
  };

  // ---------- الحجز ← السلة ----------
  const pickBooking = (b) => {
    setItems(bookingLines(b));
    setCustomerId(b.customerId ?? null);
    setBookingId(b.id);
    setBookingNo(b.number);
    if (b.technicianId) setStaffId(b.technicianId);
    setDiscount({ type: "amount", value: 0 });
    setLastKey(null);
    setBookingsOpen(false);
    message.success(tB("PosLoaded", { number: `BK-${b.number}` }));
    focusSearch();
  };

  // ---------- التعليق ----------
  const hold = () => {
    if (!items.length) return;
    const entry = {
      id: Date.now(),
      at: new Date().toISOString(),
      customerId,
      discount,
      items,
      total: totals.total,
      // الحجز يفضل مربوط بعد الاسترجاع
      bookingId,
      bookingNo,
    };
    const next = [entry, ...held].slice(0, 30);
    setHeld(next);
    writeHeld(user.id, next);
    message.success(t("Held"));
    clearCart();
  };
  const restore = (entry) => {
    if (items.length) return message.warning(t("FinishCurrentFirst"));
    setItems(entry.items);
    setCustomerId(entry.customerId ?? null);
    setDiscount(entry.discount ?? { type: "amount", value: 0 });
    setBookingId(entry.bookingId ?? null);
    setBookingNo(entry.bookingNo ?? null);
    const next = held.filter((h) => h.id !== entry.id);
    setHeld(next);
    writeHeld(user.id, next);
    setHeldOpen(false);
  };
  const dropHeld = (entry) => {
    const next = held.filter((h) => h.id !== entry.id);
    setHeld(next);
    writeHeld(user.id, next);
  };

  // ---------- الدفع ----------
  // معاينة الفاتورة قبل الدفع والحفظ (من غير مدفوعات لسه)
  const buildPreview = (ctx) => {
    if (!items.length) return null;
    const cust = customers.find((c) => c.id === customerId);
    return {
      preview: true,
      type: "sale",
      number: ctx.number,
      docCode: ctx.docCode,
      date: new Date().toISOString(),
      branch: ctx.branch,
      createdBy: ctx.user,
      customer: cust ? { phone: cust.phone } : null,
      customerArName: cust?.arName ?? null,
      customerEnName: cust?.enName ?? null,
      customerTaxNo: cust?.taxNo ?? null,
      items: previewItems(lines),
      ...previewTotals(totals),
      payments: [],
      remainingAmount: 0,
      changeAmount: 0,
      tenderedAmount: 0,
      zatcaDocument: null,
    };
  };

  const openPay = async () => {
    if (!items.length) return;
    if (!shift) return message.warning(t("OpenShiftFirst"));
    // المغسلة: القطع الجديدة لازم لها جوال العميل
    const laundryErr = lp.on ? lp.customerError() : null;
    if (laundryErr) return message.warning(laundryErr);
    // المطعم: نوع الطلب وبياناته (التطبيق / رقم الطاولة)
    const restErr = rp.on ? rp.validate() : null;
    if (restErr) return message.warning(restErr);
    if (items.some((l) => !(l.qty > 0)))
      return message.warning(t("QtyRequired"));
    // الوحدة متقبلش كسور (حبة) والكمية فيها كسر
    const badQty = items.find((l) => lineQtyProblem(l));
    if (badQty)
      return message.warning(
        `${tAlerts(qtyProblemKey(lineQtyProblem(badQty)))}: ${nameOf(badQty)}`,
      );
    // الأرقام التسلسلية ناقصة (الإلزام مفعّل) ← نفتح نافذة أول سطر ناقص
    const short = items.find((l) =>
      serialsShort(l, factorOfLine(l), serialRequired),
    );
    if (short) {
      message.warning(tSerial("MissingForItem", { name: nameOf(short) }));
      return setSerialKey(short.key);
    }
    // المغسلة: العميل عنده رصيد اشتراك ← يتخصم تلقائي (والمكافأة خصم)
    if (lp.on) {
      const plan = await lp.prepareWallet({
        discountType: discount.type,
        discountValue: Number(discount.value) || 0,
      });
      // الرصيد مكفّي: الفاتورة على طول من غير نافذة الدفع
      if (plan && plan.cashDue <= 0)
        return pay({ payments: [], tendered: 0, useWallet: true });
      if (plan)
        message.info(
          tL("WalletCoversN", {
            paid: money(plan.walletPay),
            due: money(plan.cashDue),
          }),
        );
    }
    setPayOpen(true);
  };

  // المغسلة: القطع الجديدة طلب + الطلبات المحمّلة ← فاتورة واحدة
  // (السيرفر بيبني السطور والأسعار من الطلبات، والشاشة بتبعت الدفع)
  // وضع التعديل: التعديل يتحفظ الأول وبعدين الطلب يتفوتر
  const payLaundry = async ({ payments, tendered, useWallet }) => {
    if (lp.editing) {
      const saved = await lp.saveEdit();
      if (!saved.success) return saved;
    }
    return saveKey.send(laundryCheckoutAction, {
      ...lp.checkoutPayload(),
      discountType: discount.type,
      discountValue: Number(discount.value) || 0,
      payments,
      tenderedAmount: tendered || undefined,
      useWallet: useWallet ?? Boolean(lp.walletPlan),
    });
  };

  const pay = async ({ payments, tendered, useWallet }) => {
    setPaying(true);
    const res = lp.on
      ? await payLaundry({ payments, tendered, useWallet })
      : rp.on
        ? await saveKey.send(restaurantCheckoutAction, {
            ...rp.checkoutPayload(),
            discountType: discount.type,
            discountValue: Number(discount.value) || 0,
            payments,
            tenderedAmount: tendered || undefined,
          })
        : await saveKey.send(createSaleAction, {
          source: "pos",
          customerId,
          bookingId: bookingId ?? undefined,
          discountType: discount.type,
          discountValue: Number(discount.value) || 0,
          items: items.map((l) => ({
            productId: l.productId,
            unitId: l.unitId,
            qty: Number(l.qty),
            price: Number(l.price) || 0,
            discountType: l.discountType,
            discountValue: Number(l.discountValue) || 0,
            serials: l.serials ?? [],
            batchIds: (l.batchIds ?? []).map(({ batchId, qty }) => ({
              batchId,
              qty,
            })),
            warrantyMonths: l.warrantyMonths ?? null,
            // مقدم الخدمة على السطر (عمولته)
            job:
              staffOn && l.job?.technicianId
                ? { technicianId: l.job.technicianId }
                : null,
          })),
          payments,
          tenderedAmount: tendered || undefined,
        });
    setPaying(false);
    if (!res.success) {
      if (res.error === "ShiftRequired" || res.error === "ShiftOtherBranch")
        setShift(null);
      return showActionError(res, tAlerts, locale);
    }
    setPayOpen(false);
    setLastSale(res.data);
    // المطعم: رقم الطلب + تذكرة المطبخ بعد إيصال الفاتورة
    if (rp.on) {
      if (res.data.order)
        message.success(tR("OrderNoIs", { n: res.data.order.dailyNo }));
      rp.afterPaid(res.data);
      if (!printSettings) setTimeout(rp.flushTicket, 0);
    }
    // المغسلة: اتخصم من الاشتراك
    if (res.data.wallet)
      message.success(tL("WalletPaidN", { n: money(res.data.wallet.credit) }));
    // الفاتورة الإلكترونية: التنبيه بس لو متوقعتش (الإرسال في الخلفية)
    if (res.data.zatca?.status === "unsigned")
      message.warning(tZ("result.unsigned"));
    clearCart();
    // الإيصال
    if (printSettings) {
      const full = await getSaleAction(res.data.id);
      if (full.success && full.data) {
        printSale(full.data);
        if (lp.on) waAfterPrint.current = { kind: "sale", doc: full.data };
      }
    }
  };

  // ---------- اختصارات الكيبورد ----------
  useEffect(() => {
    const onKey = (e) => {
      if (
        payOpen ||
        discountOpen ||
        heldOpen ||
        bookingsOpen ||
        salesOpen ||
        unitPick ||
        sizePick ||
        serialKey ||
        closingShift ||
        drawerOpen
      )
        return;
      if (e.key === "F2") {
        e.preventDefault();
        focusSearch();
      } else if (e.key === "F10" && rp.canSaveTable && items.length) {
        e.preventDefault();
        rp.saveTable(clearCart);
      } else if (e.key === "F10" && lp.canSaveOrder) {
        e.preventDefault();
        lp.saveOrder(clearCart, (o) => sendWa({ kind: "order", order: o }));
      } else if (e.key === "F9") {
        e.preventDefault();
        openPay();
      } else if (e.key === "F4") {
        e.preventDefault();
        hold();
      } else if (e.key === "F7") {
        e.preventDefault();
        setSalesOpen(true);
      } else if (e.key === "F6" && bookingsOn) {
        e.preventDefault();
        setBookingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const fullscreen = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch {
      /* المتصفح لا يدعم */
    }
  };

  return (
    <div className={`pos${rp.on ? " pos--restaurant" : ""}`}>
      {/* ============ الشريط العلوي ============ */}
      <div className="pos-top">
        <ShoppingCartOutlined style={{ fontSize: 20 }} />
        <span className="pos-top__title">{t("Title")}</span>
        <Tag color="cyan">{nameOf(branch)}</Tag>
        <span>{locale === "ar" ? user.arFullname : user.enFullname}</span>
        {shift ? (
          <Tag color="green">
            {t("ShiftNo")} {formatDocNo("shift", shift.number, shift.docCode)}
            {/* ترتيب الوردية في يوم العمل */}
            {shift.dayNo ? ` (${shift.dayNo})` : ""}
          </Tag>
        ) : (
          <Tag color="red">{t("NoShift")}</Tag>
        )}
        <NextDocNo type="sale" dark size="small" refreshKey={lastSale?.id} branch={false} />
        <span className="pos-top__spacer" />
        {lastSale && (
          <Link href={`/invoices/sales/${lastSale.id}`}>
            <Tag color="gold" style={{ cursor: "pointer" }}>
              {t("LastSale")} {saleDocNo("sale", lastSale.number, lastSale.docCode)}
              {lastSale.changeAmount > 0 &&
                ` — ${t("Change")} ${money(lastSale.changeAmount)}`}
            </Tag>
          </Link>
        )}
        <Tooltip title="F7">
          <Button
            ghost
            icon={<HistoryOutlined />}
            onClick={() => setSalesOpen(true)}
          >
            <span className="pos-top__label">{t("PrevSales")}</span>
          </Button>
        </Tooltip>
        {bookingNo && (
          <Tag color="purple">
            {tB("FromBooking")} <bdi>BK-{bookingNo}</bdi>
          </Tag>
        )}
        {/* المغسلة: كل الشغل من الشاشة دي (الطلبات، الاشتراكات، الإعداد) */}
        {lp.on && can("laundryOrders.view") && (
          <Link href="/laundry/orders">
            <Button ghost icon={<UnorderedListOutlined />}>
              <span className="pos-top__label">{tL("OrdersBoard")}</span>
            </Button>
          </Link>
        )}
        {lp.on && can("laundry.view") && (
          <Link href="/laundry">
            <Button ghost icon={<SettingOutlined />}>
              <span className="pos-top__label">{tL("Setup")}</span>
            </Button>
          </Link>
        )}
        {lp.on && (
          <Tooltip title={tL("WaAutoHint")}>
            <span className={`pos-top__wa ${waAuto ? "is-on" : ""}`}>
              <Switch size="small" checked={waAuto} onChange={toggleWaAuto} />
              <span className="pos-top__label">{tL("WaAuto")}</span>
            </span>
          </Tooltip>
        )}
        {/* المطعم: طلبات اليوم (الطاولات المفتوحة + البحث برقم الطلب) والمنيو */}
        {rp.on && (
          <Badge count={rp.pending} size="small">
            <Button ghost icon={<UnorderedListOutlined />} onClick={rp.openOrders}>
              <span className="pos-top__label">{tR("Orders")}</span>
            </Button>
          </Badge>
        )}
        {rp.on && can("restaurant.view") && (
          <Link href="/restaurant">
            <Button ghost icon={<SettingOutlined />}>
              <span className="pos-top__label">{tR("Menu")}</span>
            </Button>
          </Link>
        )}
        {(lp.on || rp.on) && can("salesReturns.create") && (
          <Button ghost icon={<RollbackOutlined />} onClick={() => setReturnOpen(true)}>
            <span className="pos-top__label">{tL("ReturnTitle")}</span>
          </Button>
        )}
        {lp.on && can("laundrySubscriptions.view") && (
          <Button ghost icon={<WalletOutlined />} onClick={lp.openWallets}>
            <span className="pos-top__label">{tL("Subscriptions")}</span>
          </Button>
        )}
        {bookingsOn && !lp.on && (
          <Tooltip title="F6">
            <Button
              ghost
              icon={<CalendarOutlined />}
              onClick={() => setBookingsOpen(true)}
            >
              <span className="pos-top__label">{tB("Title")}</span>
            </Button>
          </Tooltip>
        )}
        <Badge count={held.length} size="small">
          <Button
            ghost
            icon={<PlayCircleOutlined />}
            onClick={() => setHeldOpen(true)}
          >
            <span className="pos-top__label">{t("HeldInvoices")}</span>
          </Button>
        </Badge>
        {shift && canDrawer && (
          <Button
            ghost
            icon={<SwapOutlined />}
            onClick={() => setDrawerOpen(true)}
          >
            <span className="pos-top__label">{t("DrawerCash")}</span>
          </Button>
        )}
        {shift && (
          <Button
            ghost
            icon={<LockOutlined />}
            onClick={() => setClosingShift(true)}
          >
            <span className="pos-top__label">{t("CloseShift")}</span>
          </Button>
        )}
        <Tooltip title={t("Fullscreen")}>
          <Button aria-label={t("Fullscreen")} title={t("Fullscreen")} ghost icon={<FullscreenOutlined />} onClick={fullscreen} />
        </Tooltip>
        <Link href="/invoices/sales">
          <Button ghost icon={<ArrowRightOutlined />}>
            <span className="pos-top__label">{t("Exit")}</span>
          </Button>
        </Link>
      </div>

      <div className="pos-body">
        {/* ============ السلة ============ */}
        <div className="pos-cart">
          <div className="pos-cart__head">
            {lp.on ? (
              lp.head
            ) : rp.on ? (
              rp.head
            ) : (
              <>
            <div className="pos-search">
              <ProductPicker
                onAdd={addFromPicker}
                searchAction={searchSaleProductsAction}
              />
            </div>
            <Space.Compact style={{ width: "100%" }}>
              <Select
                showSearch
                allowClear
                optionFilterProp="label"
                placeholder={tS("CashCustomer")}
                style={{ width: "100%" }}
                value={customerId ?? undefined}
                onChange={(v) => setCustomerId(v ?? null)}
                options={customers.map((c) => ({
                  value: c.id,
                  label: `${c.code} - ${nameOf(c)}${c.phone ? ` (${c.phone})` : ""}`,
                }))}
              />
              {/* إضافة عميل جديد من غير ما تسيب الكاشير */}
              <QuickAddParty
                kind="customers"
                onCreated={(c) => {
                  setAddedParties((prev) => [...prev, c]);
                  setCustomerId(c.id);
                }}
              />
            </Space.Compact>
              </>
            )}
          </div>
          {!lp.on && !rp.on && (
            <>
          {/* مقدم الخدمة للأصناف اللي هتتضاف (ويتغير لكل سطر) */}
          {staffOn && (
            <div className="mt-2">
              <StaffSelect
                value={staffId}
                onChange={setStaffId}
                style={{ width: "100%" }}
              />
            </div>
          )}
          <CustomerB2BAlert
            compact
            customer={customers.find((c) => c.id === customerId)}
          />
          {/* العميل عنده حجز النهارده ولسه ما اتربطش بالفاتورة */}
          {bookingsOn && !bookingId && (
            <CustomerBookingHint
              customerId={customerId}
              hasItems={items.length > 0}
              onPick={pickBooking}
              onLink={(b) => {
                setBookingId(b.id);
                setBookingNo(b.number);
                message.success(tB("Linked", { number: `BK-${b.number}` }));
              }}
            />
          )}
            </>
          )}
          {/* عروض الولاء: مجانية في الفاتورة دي / فاضل كام */}
          <LoyaltyHint info={loyaltyInfo} />

          <div className="pos-cart__lines">
            {!lines.length ? (
              <div className="pos-cart__empty">
                <ShoppingCartOutlined style={{ fontSize: 48 }} />
                <div>{rp.on ? tR("EmptyCart") : t("EmptyCart")}</div>
                <div style={{ fontSize: 12 }}>{rp.on ? tR("ShortcutsHint") : t("ShortcutsHint")}</div>
              </div>
            ) : (
              [...lines].reverse().map((l) => {
                if (isRestaurantLine(l) || isFeeLine(l))
                  return rp.renderLine(l, {
                    lastKey,
                    onQty: (key, qty) => updateLine(key, { qty }),
                    onRemove: removeLine,
                  });
                if (isLaundryLine(l))
                  return lp.renderLine(l, {
                    lastKey,
                    onQty: (key, qty) => updateLine(key, { qty }),
                    onRemove: removeLine,
                  });
                const factor =
                  l.units.find((u) => u.unit.id === l.unitId)?.factor ?? 1;
                const short =
                  l.stock != null && l.qty * factor > l.stock + 1e-9;
                // الوحدة متقبلش كسور (حبة) والكمية فيها كسر
                const qtyBad = lineQtyProblem(l);
                return (
                  <div
                    key={l.key}
                    className={`pos-line ${l.key === lastKey ? "is-last" : ""}`}
                  >
                    <div>
                      <div className="pos-line__name">
                        {l.color && (
                          <ColorDot
                            name={l.color}
                            hex={l.colorHex}
                            size={12}
                            style={{ marginInlineEnd: 6 }}
                          />
                        )}
                        {nameOf(l)}
                      </div>
                      <div className="pos-line__meta">
                        <bdi>{l.code}</bdi> ·{" "}
                        {l.itemDiscount > 0 && l.qty > 0 ? (
                          <>
                            <s className="pos-line__old">{money(l.price)}</s>{" "}
                            <b className="pos-line__new">
                              {money((l.gross - l.itemDiscount) / l.qty)}
                            </b>
                          </>
                        ) : (
                          money(l.price)
                        )}
                        {l.taxMode === "inclusive" ? ` (${tS("InclTax")})` : ""}
                        {l.promo && (
                          <Tag
                            color="magenta"
                            icon={<GiftOutlined />}
                            className="ms-1"
                          >
                            {nameOf(l.promo)}
                          </Tag>
                        )}
                        {short && (
                          <Tag color="red" className="ms-1">
                            {t("Stock")} {Number(l.stock.toFixed(3))}
                          </Tag>
                        )}
                        {qtyBad && (
                          <Tag color="red" className="ms-1">
                            {tAlerts(qtyProblemKey(qtyBad))}
                          </Tag>
                        )}
                      </div>
                      {/* م² ↔ كرتونة (السيراميك) + زرار التقريب */}
                      <LineConversion
                        line={l}
                        onRound={(qty) => updateLine(l.key, { qty })}
                      />
                      <LineSerials
                        line={l}
                        factor={factor}
                        open={serialKey === l.key}
                        onOpenChange={(o) => {
                          setSerialKey(o ? l.key : null);
                          if (!o) focusSearch();
                        }}
                        onChange={(patch) => updateLine(l.key, patch)}
                      />
                    </div>
                    <div className="pos-line__total">{money(l.total)}</div>
                    <div className="pos-line__controls">
                      <span className="pos-qty">
                        <Button
                          className="pos-qty__minus"
                          icon={<MinusOutlined />}
                          onClick={() =>
                            l.qty <= 1
                              ? removeLine(l.key)
                              : updateLine(l.key, { qty: round(l.qty - 1, 3) })
                          }
                        />
                        <ScanSafeNumber
                          field="qty"
                          min={0}
                          precision={3}
                          controls={false}
                          status={qtyBad ? "error" : undefined}
                          value={l.qty}
                          onFocus={(e) => e.target.select()}
                          formatter={(v) =>
                            v === "" || v == null ? "" : String(Number(v))
                          }
                          onChange={(v) => updateLine(l.key, { qty: v ?? 0 })}
                        />
                        <Button
                          className="pos-qty__plus"
                          icon={<PlusOutlined />}
                          onClick={() =>
                            updateLine(l.key, { qty: round(l.qty + 1, 3) })
                          }
                        />
                      </span>
                      {l.units.length > 1 ? (
                        <Select
                          size="small"
                          style={{ minWidth: 90 }}
                          value={l.unitId}
                          onChange={(v) => changeUnit(l, v)}
                          options={l.units.map((u) => ({
                            value: u.unit.id,
                            label: nameOf(u.unit),
                          }))}
                        />
                      ) : (
                        <Tag>{nameOf(l.units[0].unit)}</Tag>
                      )}
                      {perms.changePrice && (
                        <ScanSafeNumber
                          field="price"
                          size="small"
                          style={{ width: 90 }}
                          min={0}
                          precision={decimals}
                          controls={false}
                          value={l.price}
                          onChange={(v) => updateLine(l.key, { price: v ?? 0 })}
                        />
                      )}
                      {staffOn && (
                        <StaffSelect
                          size="small"
                          style={{ minWidth: 130 }}
                          value={l.job?.technicianId}
                          onChange={(id) =>
                            updateLine(l.key, {
                              job: id ? { technicianId: id } : null,
                            })
                          }
                        />
                      )}
                      <span style={{ flex: 1 }} />
                      <Tooltip title={t("RemoveItem")}>
                        <Button
                          className="pos-line__delete"
                          icon={<DeleteOutlined />}
                          onClick={() => removeLine(l.key)}
                        >
                          {t("Remove")}
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pos-cart__foot">
            <div className="pos-sum">
              <div>
                <span>
                  {t("Items")}: {lines.length} · {t("Pieces")}:{" "}
                  {Number(count.toFixed(3))}
                </span>
                <bdi>{money(totals.subtotal)}</bdi>
              </div>
              {invoicePromo && (
                <div style={{ color: C.magenta }}>
                  <span>
                    <GiftOutlined /> {nameOf(invoicePromo)}
                  </span>
                  <bdi>
                    {invoicePromo.discountType === "percent"
                      ? `${invoicePromo.value}%`
                      : money(invoicePromo.value)}
                  </bdi>
                </div>
              )}
              {totals.itemsDiscount + totals.invoiceDiscount > 0 && (
                <div style={{ color: C.dangerText }}>
                  <span>{tS("Discount")}</span>
                  <bdi>
                    -{money(totals.itemsDiscount + totals.invoiceDiscount)}
                  </bdi>
                </div>
              )}
              <div>
                <span>{tS("NetBeforeTax")}</span>
                <bdi>{money(totals.net)}</bdi>
              </div>
              <div>
                <span>{tS("VAT")}</span>
                <bdi>{money(totals.tax)}</bdi>
              </div>
              <div className="pos-sum__grand">
                <span>{tS("Total")}</span>
                <bdi>
                  {money(totals.total)} {symbol}
                </bdi>
              </div>
            </div>
            <div className="pos-actions">
              <Button
                icon={<PauseCircleOutlined />}
                disabled={!items.length || lp.on}
                onClick={hold}
              >
                {t("Hold")} (F4)
              </Button>
              <PreviewBeforeSave
                kind="sale"
                size="middle"
                buildDoc={buildPreview}
              />
              <Button
                icon={<TagOutlined />}
                disabled={
                  !items.length || !perms.discount || Boolean(invoicePromo)
                }
                onClick={() => setDiscountOpen(true)}
              >
                {tS("Discount")}
              </Button>
              <Popconfirm
                title={t("ClearConfirm")}
                onConfirm={clearCart}
                disabled={!items.length}
              >
                <Button
                  danger
                  icon={<ClearOutlined />}
                  disabled={!items.length}
                >
                  {t("Clear")}
                </Button>
              </Popconfirm>
            </div>
            {/* المغسلة: طلب من غير فاتورة (العميل هيدفع وقت الاستلام) */}
            {lp.on && (
              <Button
                block
                size="large"
                className="lp-save-order"
                icon={<SaveOutlined />}
                disabled={!lp.canSaveOrder}
                title={
                  lp.walletBalance > 0 ? tL("SubscriberMustInvoice") : undefined
                }
                loading={lp.savingOrder}
                onClick={() =>
                  lp.saveOrder(clearCart, (o) =>
                    sendWa({ kind: "order", order: o }),
                  )
                }
              >
                {tL(lp.editing ? "SaveOrderChanges" : "SaveAsOrder")} (F10)
              </Button>
            )}
            {/* المطعم (الصالة): الطلب يتحفظ على الطاولة + تذكرة المطبخ، والحساب بعدين */}
            {rp.canSaveTable && (
              <Button
                block
                size="large"
                className="lp-save-order"
                icon={<SaveOutlined />}
                disabled={!items.length || !shift}
                loading={rp.saving}
                onClick={() => rp.saveTable(clearCart)}
              >
                {tR(
                  rp.order.orderType === "dinein"
                    ? rp.order.orderId
                      ? "UpdateTable"
                      : "SaveTable"
                    : rp.order.orderId
                      ? "UpdateOrder"
                      : "SaveOrder",
                )}{" "}
                (F10)
              </Button>
            )}
            <Button
              type="primary"
              block
              className="pos-pay-btn"
              disabled={!items.length || !shift}
              onClick={openPay}
            >
              {t("Pay")} (F9) — {money(totals.total)}
            </Button>
          </div>
        </div>

        {/* ============ الأقسام والأصناف ============ */}
        {lp.on ? (
          lp.catalog
        ) : rp.on ? (
          rp.catalog
        ) : (
          <Catalog categories={categories} onPick={addFromTile} />
        )}
      </div>

      {/* ============ النوافذ ============ */}
      {lp.modals}
      {rp.modals}
      {returnOpen && (
        <LaundryReturnModal
          methods={methods}
          printSettings={printSettings}
          company={company}
          onClose={() => setReturnOpen(false)}
        />
      )}
      <PayModal
        open={payOpen}
        total={lp.walletPlan ? lp.walletPlan.cashDue : totals.total}
        methods={methods}
        creditMethod={perms.credit && customerId ? creditMethod : null}
        hasCustomer={Boolean(customerId)}
        loading={paying}
        onCancel={() => {
          setPayOpen(false);
          lp.clearWalletPlan();
        }}
        onPay={pay}
      />

      {/* شبكة المقاسات: المقاس بوحدة واحدة بينزل على طول، وأكتر ← اختيار الوحدة */}
      {sizePick && (
        <SizePickerModal
          modelId={sizePick}
          onClose={() => {
            setSizePick(null);
            focusSearch();
          }}
          onPick={(v) => {
            setSizePick(null);
            if (v.units.length > 1) return setUnitPick(v);
            addLine(v, v.units[0].unit.id);
            focusSearch();
          }}
        />
      )}

      <Modal
        open={Boolean(unitPick)}
        onCancel={() => setUnitPick(null)}
        footer={null}
        title={nameOf(unitPick)}
        centered
        destroyOnHidden
      >
        <div className="pos-methods">
          {unitPick?.units.map((u) => (
            <Button
              key={u.unit.id}
              className="pos-method"
              style={{ height: 72 }}
              onClick={() => {
                addLine(unitPick, u.unit.id);
                setUnitPick(null);
              }}
            >
              <div>
                <div>{nameOf(u.unit)}</div>
                <div style={{ color: C.primary }}>{money(u.price)}</div>
              </div>
            </Button>
          ))}
        </div>
      </Modal>

      <Modal
        open={discountOpen}
        onCancel={() => setDiscountOpen(false)}
        onOk={() => setDiscountOpen(false)}
        title={tS("InvoiceDiscount")}
        centered
        destroyOnHidden
      >
        <DiscountInput
          type={discount.type}
          value={discount.value}
          onChange={(type, value) => setDiscount({ type, value })}
        />
      </Modal>

      <Modal
        open={heldOpen}
        onCancel={() => setHeldOpen(false)}
        footer={null}
        title={t("HeldInvoices")}
        destroyOnHidden
      >
        {!held.length ? (
          <Empty description={t("NoHeld")} />
        ) : (
          held.map((h) => (
            <div key={h.id} className="pos-line">
              <div>
                <div className="pos-line__name">
                  {formatDateTime(h.at)} · {h.items.length} {t("Items")}
                </div>
                <div className="pos-line__meta">
                  {nameOf(customers.find((c) => c.id === h.customerId)) ||
                    tS("CashCustomer")}
                </div>
              </div>
              <div className="pos-line__total">{money(h.total)}</div>
              <div className="pos-line__controls">
                <Button type="primary" size="small" onClick={() => restore(h)}>
                  {t("Restore")}
                </Button>
                <Popconfirm
                  title={t("DeleteHeld")}
                  onConfirm={() => dropHeld(h)}
                >
                  <Button aria-label={tButtons("Delete")} title={tButtons("Delete")} danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            </div>
          ))
        )}
      </Modal>

      {salesOpen && (
        <PosSalesModal
          open
          onClose={() => {
            setSalesOpen(false);
            focusSearch();
          }}
          company={company}
          printSettings={printSettings}
          onAgentPrint={
            rp.on
              ? (doc, fallback) =>
                  rp.printReceipt({
                    title: `${tR("Invoice")} ${doc.number ?? ""}`.trim(),
                    render: (paper) => (
                      <SaleDocument
                        settings={{ ...printSettings, paperSize: paper }}
                        company={company}
                        doc={doc}
                        kind="sale"
                      />
                    ),
                    fallback,
                  }) === true
              : undefined
          }
        />
      )}

      {bookingsOn && bookingsOpen && (
        <PosBookingsModal
          open
          customers={customers}
          initialQ={customers.find((c) => c.id === customerId)?.phone ?? ""}
          hasItems={items.length > 0}
          onClose={() => setBookingsOpen(false)}
          onPick={pickBooking}
        />
      )}

      {/* لا يوجد وردية: لازم يفتح وردية قبل البيع */}
      <OpenShiftModal
        open={!shift}
        closable={false}
        onOpened={(s) => {
          setShift(s);
          focusSearch();
        }}
      />
      {shift && (
        <CloseShiftModal
          shiftId={shift.id}
          open={closingShift}
          onClose={() => setClosingShift(false)}
          onClosed={() => {
            // بعد القفل: تقرير التسليم يُطبع مباشرة
            setClosingShift(false);
            router.push(`/sales/shifts/${shift.id}?print=1`);
          }}
        />
      )}

      <CashMovementModal
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onDone={() => {
          setDrawerOpen(false);
          focusSearch();
        }}
      />

      {receipt && printSettings && (
        <PrintDocument
          paperSize={printSettings.paperSize}
          onDone={() => {
            setReceipt(null);
            focusSearch();
            sendWa(waAfterPrint.current);
            waAfterPrint.current = null;
            rp.flushTicket();
          }}
        >
          <SaleDocument
            settings={printSettings}
            company={company}
            doc={receipt}
            kind="sale"
          />
        </PrintDocument>
      )}
    </div>
  );
}

// ============================================================
// الأقسام والأصناف: الرئيسي ← الفرعي ← الأصناف (بالصور والأسعار)
// ============================================================
function Catalog({ categories, onPick }) {
  const locale = useLocale();
  const t = useTranslations("Pos");
  const tAlerts = useTranslations("Alerts");
  const { amount: money } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const mains = categories.filter((c) => !c.parentId);
  const [mainId, setMainId] = useState(null);
  const [subId, setSubId] = useState(null);
  const subs = mainId ? categories.filter((c) => c.parentId === mainId) : [];
  const categoryId = subId ?? mainId ?? undefined;

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const req = useRef(0);

  const load = useCallback(
    async (p) => {
      const id = ++req.current;
      setLoading(true);
      const res = await browseSaleProductsAction({
        categoryId,
        page: p,
        pageSize: PAGE_SIZE,
      });
      if (id !== req.current) return;
      setLoading(false);
      if (!res.success) return message.error(tAlerts(res.error));
      setTotal(res.data.total);
      setPage(p);
      setRows((prev) =>
        p === 1 ? res.data.rows : [...prev, ...res.data.rows],
      );
    },
    [categoryId, tAlerts],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const stockClass = (s) =>
    s <= 0 ? "pos-stock--out" : s < 5 ? "pos-stock--low" : "pos-stock--ok";

  const catTile = (c, active, onClick) => (
    <div
      key={c?.id ?? "all"}
      className={`pos-cat ${active ? "is-active" : ""}`}
      onClick={onClick}
    >
      {c?.image ? (
        <img src={imageUrl(c.image)} alt="" />
      ) : (
        <span className="pos-cat__icon">
          <AppstoreOutlined />
        </span>
      )}
      <span>{c ? nameOf(c) : t("All")}</span>
    </div>
  );

  return (
    <div className="pos-catalog">
      <div className="pos-cats">
        {catTile(null, !mainId, () => {
          setMainId(null);
          setSubId(null);
        })}
        {mains.map((c) =>
          catTile(c, mainId === c.id, () => {
            setMainId(c.id);
            setSubId(null);
          }),
        )}
      </div>
      {subs.length > 0 && (
        <div className="pos-subcats">
          <span
            className={`pos-subcat ${!subId ? "is-active" : ""}`}
            onClick={() => setSubId(null)}
          >
            {t("AllOf", { name: nameOf(mains.find((m) => m.id === mainId)) })}
          </span>
          {subs.map((c) => (
            <span
              key={c.id}
              className={`pos-subcat ${subId === c.id ? "is-active" : ""}`}
              onClick={() => setSubId(c.id)}
            >
              {nameOf(c)}
            </span>
          ))}
        </div>
      )}
      <div className="pos-grid">
        {loading && !rows.length ? (
          <div className="pos-more">
            <Spin />
          </div>
        ) : !rows.length ? (
          <div className="pos-more">
            <Empty description={t("NoProducts")} />
          </div>
        ) : (
          rows.map((p) => (
            <div key={p.id} className="pos-tile" onClick={() => onPick(p)}>
              <span className={`pos-tile__stock ${stockClass(p.stock)}`}>
                {Number(p.stock.toFixed(3))}
              </span>
              {p.units.length > 1 && (
                <span className="pos-tile__units">{p.units.length}</span>
              )}
              <div className="pos-tile__img">
                {p.image ? (
                  <img src={imageUrl(p.image)} alt="" loading="lazy" />
                ) : (
                  <PictureOutlined />
                )}
              </div>
              <div className="pos-tile__name">{nameOf(p)}</div>
              {/* المقاسات: ألوان الموديل دواير */}
              {p.modelColors?.length > 0 && (
                <div className="pos-tile__colors">
                  {p.modelColors.slice(0, 8).map((c) => (
                    <ColorDot
                      key={c.name}
                      name={c.name}
                      hex={c.hex}
                      size={12}
                    />
                  ))}
                </div>
              )}
              <div className="pos-tile__price">{money(p.units[0].price)}</div>
            </div>
          ))
        )}
        {rows.length > 0 && rows.length < total && (
          <div className="pos-more">
            <Button loading={loading} onClick={() => load(page + 1)}>
              {t("LoadMore")} ({rows.length}/{total})
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
