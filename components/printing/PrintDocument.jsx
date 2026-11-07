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
    let cancelled = false;
    // ننتظر رسم المستند (الشعار و QR) وتحميل الخط، ثم نقيس طوله ونطبع
    const raf = requestAnimationFrame(() => {
      timer = setTimeout(async () => {
        await document.fonts?.ready;
        if (cancelled) return;
        if (paperSize === "A4" || paperSize === "A4L") {
          // A4L = A4 بالعرض (التقارير العريضة)
          const size = paperSize === "A4L" ? "A4 landscape" : "A4";
          setPageCss(`@page { size: ${size}; margin: ${margin}mm; }`);
        } else {
          // صفحة الكاشير بعرض الطباعة الفعلي (72/48mm) وبطول المستند
          // (لو الصفحة أعرض من ورق الطابعة، المستند العربي بيتقص من الشمال)
          // +3mm احتياط، وأقل طول = العرض + 10mm: الصفحة الأقصر من عرضها
          // (تذكرة مطبخ / إيصال قصير) المتصفح بيعتبرها عرضية والطابعة بتطبعها بالعرض
          const widthMm = PRINT_AREA[paperSize] ?? 72;
          const heightMm = Math.max(
            widthMm + 10,
            Math.ceil((page.current?.offsetHeight ?? 0) / PX_PER_MM) + 3,
          );
          setPageCss(
            `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`,
          );
        }
        printTimer = setTimeout(() => window.print(), 150);
      }, 300);
    });

    return () => {
      cancelled = true;
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
