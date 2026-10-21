"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PRINT_AREA } from "./invoice/InvoiceView";
import "./printing.css";

const PX_PER_MM = 96 / 25.4;

// ============================================================
// طباعة أي مستند (فاتورة شراء، مرتجع ...)
// نرسمه في عنصر مستقل داخل body ونخفي باقي الصفحة وقت الطباعة
// - A4: صفحة A4 عادية
// - الكاشير (80/58mm): طول الصفحة = طول المستند (بدون ورق زيادة)
// children: المستند نفسه، onDone: بعد إغلاق نافذة الطباعة
// ============================================================
// margin: هامش صفحة A4 بالمللي (التقارير الطويلة: كل صفحة لها هامش)
export default function PrintDocument({
  paperSize,
  children,
  onDone,
  margin = 0,
}) {
  const [root, setRoot] = useState(null);
  const [pageCss, setPageCss] = useState(null);
  const page = useRef(null);

  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const el = document.createElement("div");
    el.className = "print-root";
    document.body.appendChild(el);
    setRoot(el);
    return () => el.remove();
  }, []);

  useEffect(() => {
    if (!root) return;

    const finish = () => onDoneRef.current?.();
    window.addEventListener("afterprint", finish, { once: true });

    let timer;
    let printTimer;
    // ننتظر رسم المستند (الشعار و QR) ثم نقيس طوله ونطبع
    const raf = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        if (paperSize === "A4") {
          setPageCss(`@page { size: A4; margin: ${margin}mm; }`);
        } else {
          // صفحة الكاشير بعرض الطباعة الفعلي (72/48mm) وبطول المستند
          // (لو الصفحة أعرض من ورق الطابعة، المستند العربي بيتقص من الشمال)
          // +3mm احتياط، وأقل طول 40mm
          const heightMm = Math.max(
            40,
            Math.ceil((page.current?.offsetHeight ?? 0) / PX_PER_MM) + 3,
          );
          setPageCss(
            `@page { size: ${PRINT_AREA[paperSize] ?? 72}mm ${heightMm}mm; margin: 0; }`,
          );
        }
        printTimer = setTimeout(() => window.print(), 150);
      }, 300);
    });

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      clearTimeout(printTimer);
      window.removeEventListener("afterprint", finish);
    };
  }, [root, paperSize, margin]);

  if (!root) return null;

  return createPortal(
    <>
      {pageCss && <style>{pageCss}</style>}
      <div ref={page} className="print-page">
        {children}
      </div>
    </>,
    root,
  );
}
