"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Segmented,
  Modal,
  Result,
  Select,
  Space,
  Tag,
} from "antd";
import {
  ArrowRightOutlined,
  CoffeeOutlined,
  DeleteOutlined,
  ShopOutlined,
  ShoppingOutlined,
  MinusOutlined,
  PlusOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { imageUrl } from "@/lib/image";
import {
  publicCreateOrderAction,
  publicTablesAction,
} from "@/actions/restaurant-online.actions";
import { C } from "@/lib/theme";
import "@/components/bookings/public-booking.css";
import "./restaurant.css";

// حقول الفورم اللي ممكن خطأ السيرفر يظهر تحتها
const FORM_FIELDS = ["customerName", "phone", "branchId", "pickupAt", "notes"];

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const fmt = (v) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);

// ============================================================
// الطلب الأونلاين (للعملاء من غير تسجيل دخول): /ar/order/<كود الشركة>
// المنيو ← السلة ← الاسم والجوال والفرع وميعاد الوصول والاستلام (المحل / السيارة)
// ← رقم الطلب. الدفع عند الاستلام، والأسعار بالضريبة
// ============================================================
export default function PublicOrder({ code, info }) {
  const t = useTranslations("PublicOrder");
  const locale = useLocale();
  const nm = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  if (!info || !info.settings.online || !info.branches.length)
    return (
      <Shell company={info?.company} code={code} nm={nm}>
        <Result
          status="info"
          title={t("Unavailable")}
          subTitle={t("UnavailableHint")}
        />
      </Shell>
    );
  return (
    <Shell company={info.company} code={code} nm={nm}>
      <OrderFlow code={code} info={info} nm={nm} />
    </Shell>
  );
}

function Shell({ company, code, nm, children }) {
  const locale = useLocale();
  return (
    <div className="pb-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="pb-wrap">
        {company && (
          <div className="pb-head">
            {company.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${imageUrl(company.logo)}?c=${encodeURIComponent(code)}`}
                alt=""
                className="pb-logo"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <div>
              <div className="pb-company">{nm(company)}</div>
              {company.phone && <bdi className="pb-phone">{company.phone}</bdi>}
            </div>
          </div>
        )}
        <Card className="pb-card">{children}</Card>
      </div>
    </div>
  );
}

function OrderFlow({ code, info, nm }) {
  const t = useTranslations("PublicOrder");
  const tAlerts = useTranslations("Alerts");
  const { items, groups, sizes, categories, branches, settings, slots } = info;
  const groupById = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups],
  );
  const sizeById = useMemo(() => new Map(sizes.map((s) => [s.id, s])), [sizes]);
  const itemById = useMemo(
    () => new Map(items.map((i) => [i.productId, i])),
    [items],
  );

  // step: menu | checkout | done
  const [step, setStep] = useState("menu");
  const [cat, setCat] = useState("all");
  const [cart, setCart] = useState([]);
  const [picking, setPicking] = useState(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const [form] = Form.useForm();
  // في المحل (حجز طاولة) أو سفري (بيتغلف وتستلمه)
  const [mode, setMode] = useState("takeaway");
  const [partySize, setPartySize] = useState(2);
  const [tableId, setTableId] = useState(null);
  const [tables, setTables] = useState(null);
  const pickupAt = Form.useWatch("pickupAt", form);
  const branchWatch = Form.useWatch("branchId", form);
  const branchId = branchWatch ?? (branches.length === 1 ? branches[0].id : null);

  // الطاولات الفاضية في الميعاد وتكفي عدد الأفراد
  useEffect(() => {
    if (mode !== "dinein" || !pickupAt || !partySize || !branchId) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTables(null);
    publicTablesAction({ code, branchId, at: pickupAt, partySize }).then((res) => {
      if (!alive) return;
      const list = res.success ? res.data : [];
      setTables(list);
      setTableId((cur) => (list.some((x) => x.id === cur) ? cur : null));
    });
    return () => {
      alive = false;
    };
  }, [mode, pickupAt, partySize, branchId, code]);

  // سعر الوحدة بالضريبة: الحجم (أو الصنف) + الإضافات بنسبة ضريبة الصنف
  const unitPrice = (item, sizeId, modIds) => {
    const size = sizeId ? item.sizes.find((s) => s.sizeId === sizeId) : null;
    const mods = modIds.reduce((s, id) => {
      for (const gid of item.groupIds) {
        const m = groupById.get(gid)?.modifiers.find((x) => x.id === id);
        if (m) return s + m.price * (1 + item.taxRate / 100);
      }
      return s;
    }, 0);
    return r2((size ? size.price : item.price) + mods);
  };
  const lineLabel = (l) => {
    const item = itemById.get(l.productId);
    const size = l.sizeId ? sizeById.get(l.sizeId) : null;
    const mods = l.modifierIds
      .map((id) => {
        for (const gid of item?.groupIds ?? []) {
          const m = groupById.get(gid)?.modifiers.find((x) => x.id === id);
          if (m) return nm(m);
        }
        return null;
      })
      .filter(Boolean);
    return [size ? nm(size) : null, mods.join("، "), l.notes]
      .filter(Boolean)
      .join(" · ");
  };
  const total = r2(cart.reduce((s, l) => s + l.price * l.qty, 0));
  const count = cart.reduce((s, l) => s + l.qty, 0);

  const add = (line) =>
    setCart((prev) => {
      const sig = (x) =>
        `${x.productId}|${x.sizeId}|${[...x.modifierIds].sort().join(",")}|${x.notes}`;
      const same = prev.find((x) => sig(x) === sig(line));
      if (same)
        return prev.map((x) =>
          x === same ? { ...x, qty: Math.min(99, x.qty + line.qty) } : x,
        );
      return [...prev, { ...line, key: `${Date.now()}-${Math.random()}` }];
    });
  const pick = (item) => {
    if (!item.sizes.length && !item.groupIds.length)
      return add({
        productId: item.productId,
        sizeId: 0,
        modifierIds: [],
        notes: "",
        qty: 1,
        price: unitPrice(item, 0, []),
      });
    setPicking(item);
  };

  const send = async (v) => {
    setError(null);
    setSending(true);
    const res = await publicCreateOrderAction({
      code,
      // فرع واحد: الحقل مش ظاهر في الفورم فقيمته مش بتيجي ← الفرع الوحيد
      branchId: v.branchId ?? branches[0]?.id,
      customerName: v.customerName,
      phone: v.phone.replace(/\s/g, ""),
      pickupAt: v.pickupAt,
      // الاستلام من المحل أو في السيارة مش فارق: الطلب بيجهز على الميعاد
      pickupMode: "store",
      carInfo: null,
      orderMode: mode,
      tableId: mode === "dinein" ? tableId : null,
      partySize: mode === "dinein" ? partySize : null,
      notes: v.notes || null,
      lines: cart.map((l) => ({
        productId: l.productId,
        sizeId: l.sizeId,
        modifierIds: l.modifierIds,
        qty: l.qty,
        notes: l.notes || null,
      })),
    });
    setSending(false);
    if (!res.success) {
      // أخطاء الحقول: تظهر تحت الحقل نفسه (لو ظاهر في الفورم)
      const fe = res.fieldErrors ?? {};
      form.setFields(
        Object.entries(fe)
          .filter(([k]) => FORM_FIELDS.includes(k))
          .map(([name, code]) => ({ name, errors: [tAlerts(code)] })),
      );
      return setError(tAlerts(res.error ?? "UnexpectedError"));
    }
    setDone(res.data);
    setCart([]);
    setStep("done");
  };

  if (step === "done" && done)
    return (
      <Result
        status="success"
        title={t("Sent")}
        subTitle={
          <div className="pob-done">
            <div className="pob-done__no">
              {t("OrderNo")}: <b>#{done.dailyNo}</b>
            </div>
            <div>
              {t("PickupAt")}:{" "}
              <b>
                {new Date(done.pickupAt).toLocaleTimeString("en-GB", {
                  timeZone: "Asia/Riyadh",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </b>
            </div>
            <div>
              {t("Branch")}: <b>{nm(done.branch)}</b>
            </div>
            {done.table && (
              <div>
                {t("Table")}: <b>{done.table.name}</b> ·{" "}
                {t("PartyN", { n: done.table.partySize })}
              </div>
            )}
            <div>
              {t("Total")}: <b>{fmt(done.total)}</b>
            </div>
            <div className="pob-muted">{t("PayOnPickup")}</div>
          </div>
        }
        extra={
          <Button type="primary" onClick={() => setStep("menu")}>
            {t("NewOrder")}
          </Button>
        }
      />
    );

  if (step === "checkout")
    return (
      <>
        <Button
          type="link"
          icon={<ArrowRightOutlined />}
          onClick={() => setStep("menu")}
          className="mb-2"
          style={{ paddingInline: 0 }}
        >
          {t("BackToMenu")}
        </Button>
        <div className="pob-cart">
          {cart.map((l) => {
            const item = itemById.get(l.productId);
            return (
              <div key={l.key} className="pob-cart__line">
                <div className="pob-cart__name">
                  <b>{nm(item)}</b>
                  {lineLabel(l) && <small>{lineLabel(l)}</small>}
                </div>
                <Space.Compact className="rpos-qty">
                  <Button
                    className="rpos-qty__btn"
                    icon={<MinusOutlined />}
                    aria-label={t("Decrease")}
                    onClick={() =>
                      setCart((prev) =>
                        l.qty <= 1
                          ? prev.filter((x) => x.key !== l.key)
                          : prev.map((x) =>
                              x.key === l.key ? { ...x, qty: x.qty - 1 } : x,
                            ),
                      )
                    }
                  />
                  <span className="pob-cart__qty">{l.qty}</span>
                  <Button
                    className="rpos-qty__btn"
                    icon={<PlusOutlined />}
                    aria-label={t("Increase")}
                    onClick={() =>
                      setCart((prev) =>
                        prev.map((x) =>
                          x.key === l.key
                            ? { ...x, qty: Math.min(99, x.qty + 1) }
                            : x,
                        ),
                      )
                    }
                  />
                </Space.Compact>
                <b className="pob-cart__total">{fmt(l.price * l.qty)}</b>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={t("Remove")}
                  onClick={() =>
                    setCart((prev) => prev.filter((x) => x.key !== l.key))
                  }
                />
              </div>
            );
          })}
          <div className="pob-cart__sum">
            <span>{t("Total")}</span>
            <b>{fmt(total)}</b>
          </div>
        </div>

        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
          onFinish={send}
          initialValues={{
            branchId: branches.length === 1 ? branches[0].id : undefined,
            pickupAt: slots[0]?.at,
          }}
        >
          {/* في المحل (حجز طاولة) أو سفري */}
          {settings.dineIn && (
            <Segmented
              block
              size="large"
              className="mb-3 pob-mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "takeaway", label: t("mode.takeaway"), icon: <ShoppingOutlined /> },
                { value: "dinein", label: t("mode.dinein"), icon: <ShopOutlined /> },
              ]}
            />
          )}
          <div className="pob-fields">
            <Form.Item
              name="customerName"
              label={t("Name")}
              rules={[{ required: true, whitespace: true, message: tAlerts("RequiredField") }]}
            >
              <Input autoComplete="off" maxLength={150} />
            </Form.Item>
            <Form.Item
              name="phone"
              label={t("Phone")}
              rules={[
                { required: true, message: tAlerts("RequiredField") },
                { pattern: /^\+?\d{9,15}$/, message: tAlerts("PhoneInvalid") },
              ]}
            >
              <Input dir="ltr" inputMode="tel" autoComplete="off" maxLength={16} />
            </Form.Item>
            {branches.length > 1 && (
              <Form.Item
                name="branchId"
                label={t("Branch")}
                rules={[{ required: true, message: tAlerts("RequiredField") }]}
              >
                <Select
                  options={branches.map((b) => ({ value: b.id, label: nm(b) }))}
                />
              </Form.Item>
            )}
            <Form.Item
              name="pickupAt"
              label={t("PickupAt")}
              tooltip={t("PickupHint")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <Select
                placeholder={t("ChooseTime")}
                options={slots.map((s) => ({ value: s.at, label: s.time }))}
                notFoundContent={t("NoSlots")}
              />
            </Form.Item>
            {mode === "dinein" && (
              <Form.Item label={t("PartySize")}>
                <InputNumber
                  min={1}
                  max={100}
                  precision={0}
                  value={partySize}
                  onChange={(v) => setPartySize(v || 1)}
                  style={{ width: "100%" }}
                />
              </Form.Item>
            )}
          </div>
          {mode === "dinein" && (
            <div className="rpos-block">
              <div className="rpos-block__title">{t("ChooseTable")}</div>
              {tables === null ? (
                <div className="pob-muted">{t("LoadingTables")}</div>
              ) : tables.length ? (
                <div className="rpos-chips">
                  {tables.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      className={`rpos-chip ${tableId === x.id ? "is-on" : ""}`}
                      onClick={() => setTableId(x.id)}
                    >
                      <b>{x.name}</b>
                      <small>{t("SeatsN", { n: x.seats })}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <Alert type="warning" showIcon title={t("NoTablesFree")} />
              )}
            </div>
          )}
          <Form.Item name="notes" label={t("Notes")}>
            <Input.TextArea rows={2} maxLength={300} />
          </Form.Item>
          {settings.note && (
            <Alert type="info" showIcon className="mb-3" title={settings.note} />
          )}
          {error && <Alert type="error" showIcon className="mb-3" title={error} />}
          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            className="pob-send"
            loading={sending}
            disabled={!cart.length || !slots.length || (mode === "dinein" && !tableId)}
          >
            {t("Send")} — {fmt(total)}
          </Button>
          <div className="pob-muted" style={{ marginTop: 8, textAlign: "center" }}>
            {t("PayOnPickup")}
          </div>
        </Form>
      </>
    );

  // ---------- المنيو ----------
  const shown = items.filter((i) => cat === "all" || i.categoryId === cat);
  return (
    <>
      {!slots.length && (
        <Alert
          type="warning"
          showIcon
          className="mb-3"
          title={t("ClosedNow", { open: settings.open, close: settings.close })}
        />
      )}
      <div className="pob-cats">
        {[{ id: "all", arName: t("All"), enName: t("All") }, ...categories].map(
          (c) => (
            <button
              key={c.id}
              type="button"
              className={`pob-cat ${cat === c.id ? "is-on" : ""}`}
              onClick={() => setCat(c.id)}
            >
              {nm(c)}
            </button>
          ),
        )}
      </div>
      {shown.length ? (
        <div className="pob-grid">
          {shown.map((i) => (
            <button
              key={i.productId}
              type="button"
              className="pob-item"
              onClick={() => pick(i)}
            >
              <div className="pob-item__img">
                {i.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${imageUrl(i.image)}?c=${encodeURIComponent(code)}`} alt="" />
                ) : (
                  <CoffeeOutlined />
                )}
              </div>
              <div className="pob-item__name">{nm(i)}</div>
              <div className="pob-item__price">
                {i.sizes.length
                  ? `${t("From")} ${fmt(Math.min(...i.sizes.map((s) => s.price)))}`
                  : fmt(i.price)}
              </div>
              <span className="pob-item__add">
                <PlusOutlined />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("NoItems")} />
      )}

      {count > 0 && (
        <div className="pob-bar">
          <Button
            type="primary"
            size="large"
            block
            icon={<ShoppingCartOutlined />}
            onClick={() => setStep("checkout")}
          >
            {t("Cart", { n: count })} — {fmt(total)}
          </Button>
        </div>
      )}

      {picking && (
        <PickModal
          item={picking}
          groupById={groupById}
          sizeById={sizeById}
          nm={nm}
          unitPrice={unitPrice}
          onClose={() => setPicking(null)}
          onAdd={(line) => {
            add(line);
            setPicking(null);
          }}
        />
      )}
    </>
  );
}

// ---------- الصنف: الحجم والإضافات والكمية ----------
function PickModal({ item, groupById, sizeById, nm, unitPrice, onClose, onAdd }) {
  const t = useTranslations("PublicOrder");
  const groups = item.groupIds.map((id) => groupById.get(id)).filter(Boolean);
  const [sizeId, setSizeId] = useState(item.sizes[0]?.sizeId ?? 0);
  const [mods, setMods] = useState([]);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");

  const toggle = (g, id) =>
    setMods((prev) => {
      const inGroup = prev.filter((m) => g.modifiers.some((x) => x.id === m));
      if (prev.includes(id)) return prev.filter((m) => m !== id);
      if (g.maxSelect === 1)
        return [...prev.filter((m) => !inGroup.includes(m)), id];
      if (g.maxSelect && inGroup.length >= g.maxSelect) return prev;
      return [...prev, id];
    });
  const missing = groups.find(
    (g) =>
      mods.filter((m) => g.modifiers.some((x) => x.id === m)).length <
      Math.min(g.minSelect, g.modifiers.length),
  );
  const price = unitPrice(item, sizeId, mods);
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
      title={nm(item)}
      onCancel={onClose}
      okText={`${t("AddToCart")} — ${fmt(price * qty)}`}
      okButtonProps={{ disabled: Boolean(missing), size: "large" }}
      onOk={() =>
        onAdd({
          productId: item.productId,
          sizeId,
          modifierIds: mods,
          notes: notes.trim(),
          qty,
          price,
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
                <small>{fmt(s.price)}</small>
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
                {m.price > 0 && (
                  <small>+{fmt(m.price * (1 + item.taxRate / 100))}</small>
                )}
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
            icon={<MinusOutlined />}
            aria-label={t("Decrease")}
            onClick={() => setQty((v) => Math.max(1, v - 1))}
          />
          <InputNumber
            min={1}
            max={99}
            precision={0}
            controls={false}
            value={qty}
            onChange={(v) => setQty(v || 1)}
            style={{ width: 70 }}
          />
          <Button
            className="rpos-qty__btn"
            icon={<PlusOutlined />}
            aria-label={t("Increase")}
            onClick={() => setQty((v) => Math.min(99, v + 1))}
          />
        </Space.Compact>
      </div>
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
