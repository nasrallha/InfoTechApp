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
  Tag,
  Tooltip,
} from "antd";
import {
  AppstoreOutlined,
  ArrowRightOutlined,
  ClearOutlined,
  DeleteOutlined,
  FullscreenOutlined,
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
import { showActionError } from "@/components/common/actionError";
import { useSaveKey } from "@/components/common/useSaveKey";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCan } from "@/components/auth/AuthProvider";
import ProductPicker from "@/components/purchases/ProductPicker";
import DiscountInput from "@/components/purchases/DiscountInput";
import PrintDocument from "@/components/printing/PrintDocument";
import { lineFromProduct } from "@/components/sales/SaleForm";
import SaleDocument from "@/components/sales/SaleDocument";
import {
  CashMovementModal,
  CloseShiftModal,
  OpenShiftModal,
} from "@/components/sales/ShiftModals";
import PayModal from "./PayModal";
import "@/components/purchases/purchases.css";
import "./pos.css";
import QuickAddParty from "@/components/parties/QuickAddParty";
import PreviewBeforeSave from "@/components/printing/PreviewBeforeSave";
import { previewItems, previewTotals } from "@/lib/preview-doc";
import CustomerB2BAlert from "@/components/zatca/CustomerB2BAlert";
import ScanSafeNumber from "@/components/common/ScanSafeNumber";

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
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Pos");
  const tZ = useTranslations("Zatca");
  const tS = useTranslations("Sales");
  const tAlerts = useTranslations("Alerts");
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
  const [items, setItems] = useState([]);
  const [lastKey, setLastKey] = useState(null);
  const [customerId, setCustomerId] = useState(null);
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
  const [held, setHeld] = useState([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [lastSale, setLastSale] = useState(null);

  useEffect(() => setHeld(readHeld(user.id)), [user.id]);

  // العروض الشغالة بتنزل لوحدها (نفس حساب السيرفر)
  const { lines, totals, invoicePromo } = useMemo(() => {
    const applied = applyPromotions({
      items,
      promos: promotions,
      discountType: discount.type,
      discountValue: discount.value,
      decimals,
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
    };
  }, [items, discount, decimals, promotions]);
  const count = items.reduce((s, l) => s + Number(l.qty || 0), 0);

  const focusSearch = () =>
    setTimeout(() => document.querySelector(".pos-search input")?.focus(), 30);

  const addLine = useCallback((product, unitId, qty = 1) => {
    setItems((prev) => {
      const found = prev.find(
        (l) => l.productId === product.id && l.unitId === unitId,
      );
      if (found) {
        setLastKey(found.key);
        return prev.map((l) =>
          l === found ? { ...l, qty: round(l.qty + qty, 3) } : l,
        );
      }
      const line = lineFromProduct(product, unitId, qty);
      setLastKey(line.key);
      return [...prev, line];
    });
  }, []);

  // من الماسح/البحث: الوحدة معروفة (باركودها) أو الأولى
  // باركود الميزان: options.qty = الوزن من الباركود
  const addFromPicker = (product, unitId, options) =>
    addLine(
      product,
      unitId ?? product.exactUnitId ?? product.units[0].unit.id,
      options?.qty > 0 ? options.qty : 1,
    );

  // من كارت الصنف: لو له أكثر من وحدة نسأل عن الوحدة
  const addFromTile = (product) => {
    if (product.units.length > 1) return setUnitPick(product);
    addLine(product, product.units[0].unit.id);
  };

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
    setCustomerId(null);
    setDiscount({ type: "amount", value: 0 });
    setLastKey(null);
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

  const openPay = () => {
    if (!items.length) return;
    if (!shift) return message.warning(t("OpenShiftFirst"));
    if (items.some((l) => !(l.qty > 0)))
      return message.warning(t("QtyRequired"));
    setPayOpen(true);
  };

  const pay = async ({ payments, tendered }) => {
    setPaying(true);
    const res = await saveKey.send(createSaleAction, {
      source: "pos",
      customerId,
      discountType: discount.type,
      discountValue: Number(discount.value) || 0,
      items: items.map((l) => ({
        productId: l.productId,
        unitId: l.unitId,
        qty: Number(l.qty),
        price: Number(l.price) || 0,
        discountType: l.discountType,
        discountValue: Number(l.discountValue) || 0,
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
    // الفاتورة الإلكترونية: التنبيه بس لو متوقعتش (الإرسال في الخلفية)
    if (res.data.zatca?.status === "unsigned")
      message.warning(tZ("result.unsigned"));
    clearCart();
    // الإيصال
    if (printSettings) {
      const full = await getSaleAction(res.data.id);
      if (full.success && full.data) setReceipt(full.data);
    }
  };

  // ---------- اختصارات الكيبورد ----------
  useEffect(() => {
    const onKey = (e) => {
      if (
        payOpen ||
        discountOpen ||
        heldOpen ||
        unitPick ||
        closingShift ||
        drawerOpen
      )
        return;
      if (e.key === "F2") {
        e.preventDefault();
        focusSearch();
      } else if (e.key === "F9") {
        e.preventDefault();
        openPay();
      } else if (e.key === "F4") {
        e.preventDefault();
        hold();
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
    <div className="pos">
      {/* ============ الشريط العلوي ============ */}
      <div className="pos-top">
        <ShoppingCartOutlined style={{ fontSize: 20 }} />
        <span className="pos-top__title">{t("Title")}</span>
        <Tag color="cyan">{nameOf(branch)}</Tag>
        <span>{locale === "ar" ? user.arFullname : user.enFullname}</span>
        {shift ? (
          <Tag color="green">
            {t("ShiftNo")} {formatDocNo("shift", shift.number)}
          </Tag>
        ) : (
          <Tag color="red">{t("NoShift")}</Tag>
        )}
        <NextDocNo type="sale" dark size="small" refreshKey={lastSale?.id} />
        <span className="pos-top__spacer" />
        {lastSale && (
          <Link href={`/invoices/sales/${lastSale.id}`}>
            <Tag color="gold" style={{ cursor: "pointer" }}>
              {t("LastSale")} {saleDocNo("sale", lastSale.number)}
              {lastSale.changeAmount > 0 &&
                ` — ${t("Change")} ${money(lastSale.changeAmount)}`}
            </Tag>
          </Link>
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
          <Button ghost icon={<FullscreenOutlined />} onClick={fullscreen} />
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
          </div>
          <CustomerB2BAlert
            compact
            customer={customers.find((c) => c.id === customerId)}
          />

          <div className="pos-cart__lines">
            {!lines.length ? (
              <div className="pos-cart__empty">
                <ShoppingCartOutlined style={{ fontSize: 48 }} />
                <div>{t("EmptyCart")}</div>
                <div style={{ fontSize: 12 }}>{t("ShortcutsHint")}</div>
              </div>
            ) : (
              [...lines].reverse().map((l) => {
                const factor =
                  l.units.find((u) => u.unit.id === l.unitId)?.factor ?? 1;
                const short =
                  l.stock != null && l.qty * factor > l.stock + 1e-9;
                return (
                  <div
                    key={l.key}
                    className={`pos-line ${l.key === lastKey ? "is-last" : ""}`}
                  >
                    <div>
                      <div className="pos-line__name">{nameOf(l)}</div>
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
                      </div>
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
                <div style={{ color: "#c41d7f" }}>
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
                <div style={{ color: "#cf1322" }}>
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
                disabled={!items.length}
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
        <Catalog categories={categories} onPick={addFromTile} />
      </div>

      {/* ============ النوافذ ============ */}
      <PayModal
        open={payOpen}
        total={totals.total}
        methods={methods}
        creditMethod={perms.credit && customerId ? creditMethod : null}
        hasCustomer={Boolean(customerId)}
        loading={paying}
        onCancel={() => setPayOpen(false)}
        onPay={pay}
      />

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
                <div style={{ color: "#006266" }}>{money(u.price)}</div>
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
                  <Button danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            </div>
          ))
        )}
      </Modal>

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
