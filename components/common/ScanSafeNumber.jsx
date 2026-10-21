"use client";

import { useEffect, useRef } from "react";
import { InputNumber } from "antd";
import { useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";

// ============================================================
// خانة رقم محمية من الباركود (الكمية / السعر / الخصم)
// المشكلة: الكاشير يمسح الباركود والمؤشر واقف في خانة الكمية أو السعر،
//   فرقم الباركود يتكتب مكان الكمية أو السعر ويبوّظ الحسابات
// الحل: جهاز الباركود بيكتب الحروف ورا بعض بسرعة جداً (أقل من 40 مللي ثانية
//   بين كل حرف) وده مستحيل لإيد إنسان. لو حصل كده في الخانة:
//   - القيمة ترجع زي ما كانت قبل المسح
//   - رسالة خطأ واضحة
//   - المؤشر يخرج من الخانة (عشان المسح الجاي يروح لمكانه الصح)
// + أي رقم من 7 أرقام أو أكتر (مليون فأكتر) بيترفض برضه، لأن ده غالباً باركود
// field: "qty" | "price" | "discount" (لنص الرسالة)
// باقي الخصائص زي InputNumber بالظبط
// ============================================================
const FAST_MS = 40; // متوسط الوقت بين الحروف في المسح
const MIN_CHARS = 4; // أقل عدد حروف نعتبره باركود
const GAP_MS = 100; // فاصل أكبر من كده = كتابة جديدة
const IDLE_MS = 150; // لو جهاز الباركود مبعتش Enter: نحكم بعد التوقف
const MAX_NUMBER = 1_000_000; // 7 أرقام = باركود

export default function ScanSafeNumber({
  value,
  onChange,
  field = "qty",
  onKeyDown,
  ...rest
}) {
  const t = useTranslations("Alerts");
  const inputRef = useRef(null);
  const burst = useRef(null); // { times: [], before }
  const timer = useRef(null);
  const valueRef = useRef(value);
  const changeRef = useRef(onChange);

  useEffect(() => {
    valueRef.current = value;
    changeRef.current = onChange;
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const isScan = (b) =>
    Boolean(b) &&
    b.times.length >= MIN_CHARS &&
    (b.times[b.times.length - 1] - b.times[0]) / (b.times.length - 1) < FAST_MS;

  // لو اللي اتكتب باركود: نرجّع القيمة القديمة ونطلّع رسالة
  const check = () => {
    clearTimeout(timer.current);
    const b = burst.current;
    burst.current = null;
    if (!isScan(b)) return false;
    changeRef.current?.(b.before);
    message.error({ content: t(`ScanIn.${field}`), duration: 5 });
    inputRef.current?.blur();
    return true;
  };

  // رقم كبير جداً (7 أرقام أو أكتر): نرفضه ونرجّع آخر قيمة سليمة
  const handleChange = (v) => {
    if (v != null && Math.abs(Number(v)) >= MAX_NUMBER) {
      clearTimeout(timer.current);
      burst.current = null;
      message.error({ content: t(`TooLong.${field}`), duration: 5 });
      changeRef.current?.(valueRef.current);
      inputRef.current?.blur();
      return;
    }
    onChange?.(v);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      if (check()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const now = performance.now();
      const b = burst.current;
      if (!b || now - b.times[b.times.length - 1] > GAP_MS) {
        burst.current = { times: [now], before: valueRef.current };
      } else {
        b.times.push(now);
      }
      clearTimeout(timer.current);
      timer.current = setTimeout(check, IDLE_MS);
    }
    onKeyDown?.(e);
  };

  return (
    <InputNumber
      {...rest}
      ref={inputRef}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  );
}
