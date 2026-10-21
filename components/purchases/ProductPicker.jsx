"use client";

import { useEffect, useRef, useState } from "react";
import { Empty, Input, Spin, Tag } from "antd";
import { message } from "@/components/common/feedback";
import { BarcodeOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { searchPurchaseProductsAction } from "@/actions/purchase.actions";

// ============================================================
// إضافة صنف للفاتورة: بالكتابة (اسم أو كود) أو بالماسح (باركود + Enter)
// - Enter والنص = باركود وحدة بالظبط ← يضاف مباشرة بتلك الوحدة
// - غير ذلك: قائمة نتائج، نختار منها بالماوس أو بالأسهم + Enter
// onAdd(product, unitId): يضيف الصنف بالوحدة المحددة
// ============================================================
// searchAction: دالة البحث (افتراضياً بحث المشتريات؛ التحويل والجرد يمررون دالتهم)
export default function ProductPicker({
  onAdd,
  disabled,
  searchAction = searchPurchaseProductsAction,
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
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
    onAdd(
      product,
      unitId ?? product.exactUnitId ?? product.units[0].unit.id,
      product.scaleQty ? { qty: product.scaleQty } : undefined,
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
      message.warning(t("ProductNotFoundFor", { q }));
      setResults([]);
      return;
    }
    setResults(data);
    setOpen(true);
    setActive(0);
  };

  return (
    <div className="pur-picker" ref={boxRef}>
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
