"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadPdf } from "@/lib/pdf";
import { message } from "@/components/common/feedback";

// ============================================================
// تنزيل مستند كـ PDF: نرسمه خارج الشاشة بمقاسه الحقيقي ثم نحوله لملف
// paperSize: "A4" | "80mm" | "58mm"
// children: المستند، onDone: بعد التنزيل (أو الفشل)
// ============================================================
// attachXml: { xml, name } ← يتضمّن الـ XML جوه الـ PDF (فاتورة إلكترونية PDF/A-3)
export default function PdfDocument({
  paperSize,
  fileName,
  children,
  onDone,
  attachXml,
}) {
  const [root, setRoot] = useState(null);
  const page = useRef(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;top:0;left:-10000px;z-index:-1;background:#fff;";
    document.body.appendChild(el);
    setRoot(el);
    return () => el.remove();
  }, []);

  useEffect(() => {
    if (!root) return;
    let alive = true;
    // ننتظر رسم المستند (والـ QR) قبل التصوير
    const timer = setTimeout(async () => {
      try {
        if (page.current)
          await downloadPdf(page.current, fileName, paperSize, { attachXml });
      } catch (e) {
        console.error(e);
        message.error("PDF");
      } finally {
        if (alive) onDoneRef.current?.();
      }
    }, 600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // attachXml بيتحدد مرة واحدة مع فتح المستند
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, fileName, paperSize]);

  if (!root) return null;
  return createPortal(
    <div ref={page} style={{ display: "inline-block", background: "#fff" }}>
      {children}
    </div>,
    root,
  );
}
