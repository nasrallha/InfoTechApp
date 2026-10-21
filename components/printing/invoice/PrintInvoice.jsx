"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import InvoiceView, { PRINT_AREA } from "./InvoiceView";

const PX_PER_MM = 96 / 25.4;

// طباعة الفاتورة: نرسمها في عنصر مستقل داخل body ونخفي باقي الصفحة وقت الطباعة
// - A4: صفحة A4 عادية
// - الكاشير (80/58mm): نقيس طول الفاتورة ونجعل الصفحة بنفس الطول (بدون ورق زيادة)
// copies: عدد النسخ (كل نسخة صفحة)
export default function PrintInvoice({
  settings,
  company,
  branch,
  invoice,
  onDone,
}) {
  const [root, setRoot] = useState(null);
  const [pageCss, setPageCss] = useState(null);
  const firstCopy = useRef(null);

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

  // بعد الرسم: نحدد مقاس الصفحة ثم نفتح نافذة الطباعة
  useEffect(() => {
    if (!root) return;

    const finish = () => onDoneRef.current?.();
    window.addEventListener("afterprint", finish, { once: true });

    let timer;
    let printTimer;
    // ننتظر رسم الفاتورة (الشعار و QR) ثم نقيس طولها ونطبع
    const raf = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        if (settings.paperSize === "A4") {
          setPageCss("@page { size: A4; margin: 0; }");
        } else {
          // طول الفاتورة بالمللي (+3mm احتياط، وأقل طول 40mm)
          const heightMm = Math.max(
            40,
            Math.ceil((firstCopy.current?.offsetHeight ?? 0) / PX_PER_MM) + 3,
          );
          setPageCss(
            `@page { size: ${PRINT_AREA[settings.paperSize] ?? 72}mm ${heightMm}mm; margin: 0; }`,
          );
        }
        printTimer = setTimeout(() => window.print(), 150);
      }, 400);
    });

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      clearTimeout(printTimer);
      window.removeEventListener("afterprint", finish);
    };
  }, [root, settings.paperSize]);

  if (!root) return null;

  const copies = Math.max(1, Math.min(5, settings.copies ?? 1));

  return createPortal(
    <>
      {pageCss && <style>{pageCss}</style>}
      {Array.from({ length: copies }, (_, i) => (
        <div
          key={i}
          ref={i === 0 ? firstCopy : undefined}
          className="print-page"
        >
          <InvoiceView
            settings={settings}
            company={company}
            branch={branch}
            invoice={invoice}
          />
        </div>
      ))}
    </>,
    root,
  );
}
