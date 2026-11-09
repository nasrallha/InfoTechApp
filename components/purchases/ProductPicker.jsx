"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Empty, Input, Modal, Spin, Tag } from "antd";
import { message } from "@/components/common/feedback";
import { BarcodeOutlined, StopOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { searchPurchaseProductsAction } from "@/actions/purchase.actions";
import { C } from "@/lib/theme";

// ============================================================
// إضافة صنف للفاتورة: بالكتابة (اسم أو كود) أو بالماسح (باركود + Enter)
// - Enter والنص = باركود وحدة بالظبط ← يضاف مباشرة بتلك الوحدة
// - غير ذلك: قائمة نتائج، نختار منها بالماوس أو بالأسهم + Enter
// onAdd(product, unitId): يضيف الصنف بالوحدة المحددة
// ============================================================
// searchAction: دالة البحث (افتراضياً بحث المشتريات؛ التحويل والجرد يمررون دالتهم)
// stock + onResults (اختياري - التحويل): الرصيد المتاح لكل صنف في القائمة
//   onResults(ids) ← الشاشة تجيب الرصيد، وstock = { [productId]: الكمية بالأساسية }
export default function ProductPicker({
  onAdd,
  disabled,
  searchAction = searchPurchaseProductsAction,
  stock = null,
  onResults,
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  // باركود/كود مش موجود: رسالة كبيرة توقف الضرب لحد ما يقفلها بإيده
  const [missing, setMissing] = useState(null);
  const inputRef = useRef(null);
  const requestId = useRef(0);
  const boxRef = useRef(null);

  const locale = useLocale();
  const t = useTranslations("Purchases");
  const tAlerts = useTranslations("Alerts");
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);

  const search = async (q) => {
    const id = ++requestId.current;
    setLoading(true);
    const res = await searchAction(q);
    // نتجاهل نتيجة بحث قديم وصلت متأخرة
    if (id !== requestId.current) return null;
    setLoading(false);
    if (!res.success) {
      message.error(tAlerts(res.error));
      return null;
    }
    return res.data;
  };

  // بحث أثناء الكتابة (بعد توقف قصير)
  useEffect(() => {
    const q = text.trim();
    if (!q) {
      requestId.current++;
      setResults([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      const data = await search(q);
      if (data) {
        setResults(data);
        setOpen(true);
        onResults?.(data.map((p) => p.id));
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // إغلاق القائمة عند الضغط خارجها
  useEffect(() => {
    const close = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const add = (product, unitId) => {
    // باركود الميزان: الكمية (الوزن) جاية من الباركود
    // الرقم التسلسلي اللي اتمسح (القطعة تتضاف برقمها)
    const options = {
      ...(product.scaleQty ? { qty: product.scaleQty } : {}),
      ...(product.scannedSerial ? { serial: product.scannedSerial } : {}),
    };
    onAdd(
      product,
      unitId ?? product.exactUnitId ?? product.units[0].unit.id,
      Object.keys(options).length ? options : undefined,
    );
    setText("");
    setResults([]);
    setOpen(false);
    setActive(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = async (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      setOpen(true);
      setActive((i) =>
        e.key === "ArrowDown"
          ? (i + 1) % results.length
          : (i - 1 + results.length) % results.length,
      );
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();

    // اختيار من القائمة بالأسهم
    if (open && active >= 0 && results[active]) {
      add(results[active]);
      return;
    }

    // الماسح: بحث فوري بالنص كاملاً
    const q = text.trim();
    if (!q) return;
    const data = await search(q);
    if (!data) return;

    const exact = data.find((p) => p.exactUnitId);
    if (exact) return add(exact, exact.exactUnitId);
    if (data.length === 1) return add(data[0]);
    if (!data.length) {
      setText("");
      setResults([]);
      setOpen(false);
      inputRef.current?.blur();
      setMissing(q);
      beep();
      return;
    }
    setResults(data);
    setOpen(true);
    setActive(0);
  };

  const closeMissing = () => {
    setMissing(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="pur-picker" ref={boxRef}>
      {missing !== null && (
        <MissingAlert code={missing} onClose={closeMissing} t={t} />
      )}
      <Input
        ref={inputRef}
        size="large"
        allowClear
        disabled={disabled}
        prefix={<BarcodeOutlined />}
        suffix={loading ? <Spin size="small" /> : null}
        placeholder={t("SearchOrScan")}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(-1);
        }}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {open && text.trim() && (
        <div className="pur-picker__list">
          {!results.length && !loading ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("NoResults")}
            />
          ) : (
            results.map((p, i) => (
              <div
                key={p.id}
                className={`pur-picker__item ${i === active ? "is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(p);
                }}
              >
                <div>
                  <div className="pur-picker__name">{nameOf(p)}</div>
                  <div className="pur-picker__code">
                    <bdi>{p.code}</bdi>
                    {/* الرصيد المتاح (التحويل: في المستودع المُرسِل) */}
                    {stock && stock[p.id] !== undefined && (
                      <b
                        style={{
                          marginInlineStart: 10,
                          color: stock[p.id] > 0 ? C.successText : C.danger,
                        }}
                      >
                        {t("AvailableShort")}: {Number(stock[p.id].toFixed(3))}{" "}
                        {nameOf(p.units[0].unit)}
                      </b>
                    )}
                  </div>
                </div>
                <div className="pur-picker__units">
                  {p.units.map((u) => (
                    <Tag
                      key={u.unit.id}
                      color={u.unit.id === p.exactUnitId ? "green" : undefined}
                      style={{ cursor: "pointer" }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        add(p, u.unit.id);
                      }}
                    >
                      {nameOf(u.unit)}
                    </Tag>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// رسالة "الصنف مش موجود" في نص الشاشة + صوت تنبيه
// - بتمنع أي ضرب (الماسح بيكتب حروف + Enter): كل الكيبورد بيتجاهل
//   ما عدا Esc، والقفل بزرار "تمام" بالماوس أو Esc بس
//   (عشان الصنف اللي بعده ما يتضربش والعامل مش واخد باله)
// ============================================================
function MissingAlert({ code, onClose, t }) {
  useEffect(() => {
    const block = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", block, true);
    window.addEventListener("keypress", block, true);
    return () => {
      window.removeEventListener("keydown", block, true);
      window.removeEventListener("keypress", block, true);
    };
  }, [onClose]);

  return (
    <Modal
      open
      centered
      width={520}
      closable={false}
      keyboard={false}
      mask={{ closable: false }}
      footer={null}
      styles={{ mask: { background: "rgba(127, 29, 29, 0.55)" } }}
    >
      <div style={{ textAlign: "center", padding: "12px 4px" }}>
        <StopOutlined style={{ fontSize: 72, color: C.danger }} />
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: C.dangerText,
            margin: "14px 0 6px",
          }}
        >
          {t("NotFoundTitle")}
        </div>
        {/* نفس الرسالة باللغة التانية (عربي + إنجليزي دايماً) */}
        <div
          style={{ fontSize: 20, fontWeight: 700, color: C.dangerText }}
          dir={t("NotFoundDir2")}
        >
          {t("NotFoundTitle2")}
        </div>
        <div
          dir="ltr"
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 1,
            background: C.dangerSoft,
            border: `1px dashed ${C.dangerBorder}`,
            borderRadius: 10,
            padding: "8px 12px",
            margin: "10px 0",
            wordBreak: "break-all",
          }}
        >
          {code}
        </div>
        <div style={{ color: C.text2, fontSize: 15, marginBottom: 6 }}>
          {t("NotFoundHint")}
        </div>
        <div
          style={{ color: C.muted, fontSize: 14, marginBottom: 18 }}
          dir={t("NotFoundDir2")}
        >
          {t("NotFoundHint2")}
        </div>
        <Button
          type="primary"
          danger
          size="large"
          block
          style={{ height: 52, fontSize: 18 }}
          onClick={onClose}
        >
          {t("NotFoundOk")}
        </Button>
      </div>
    </Modal>
  );
}

// صوت تنبيه (3 صفارات) من غير ملفات صوت
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.22, 0.44].forEach((at) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + at);
      gain.gain.setValueAtTime(0, ctx.currentTime + at + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.16);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {
    // المتصفح مش بيسمح بالصوت: الرسالة كفاية
  }
}
