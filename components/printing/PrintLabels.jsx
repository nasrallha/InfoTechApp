"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BarcodeLabelView from "./BarcodeLabelView";

// طباعة الملصقات: نرسمها في عنصر مستقل داخل body (خارج تصميم الصفحة)
// ونخفي كل شيء آخر وقت الطباعة (printing.css)، وكل ملصق = صفحة بمقاس القالب
// label: القالب، items: قائمة الملصقات (كل عنصر = ملصق واحد)، onDone: بعد انتهاء الطباعة
export default function PrintLabels({ label, items, companyName, currency, onDone }) {
  const [root, setRoot] = useState(null);

  // نحفظ onDone في ref حتى لا تُفتح نافذة الطباعة مرة أخرى مع كل render للأب
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // عنصر الطباعة في body
  useEffect(() => {
    const el = document.createElement("div");
    el.className = "print-root";
    document.body.appendChild(el);
    setRoot(el);
    return () => el.remove();
  }, []);

  // بعد رسم الملصقات (والباركود بداخلها) نفتح نافذة الطباعة
  useEffect(() => {
    if (!root) return;

    const finish = () => onDoneRef.current?.();
    window.addEventListener("afterprint", finish, { once: true });

    // ننتظر إطارين + لحظة حتى يكتمل رسم كل الباركودات
    let timer;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        timer = setTimeout(() => window.print(), 150);
      }),
    );

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener("afterprint", finish);
    };
  }, [root]);

  if (!root) return null;

  return createPortal(
    <>
      {/* مقاس الصفحة = مقاس الملصق، بدون هوامش */}
      <style>{`@page { size: ${label.width}mm ${label.height}mm; margin: 0; }`}</style>
      {items.map((item, i) => (
        <BarcodeLabelView
          key={i}
          label={label}
          item={item}
          companyName={companyName}
          currency={currency}
        />
      ))}
    </>,
    root,
  );
}
