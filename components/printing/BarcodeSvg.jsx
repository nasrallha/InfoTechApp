"use client";
import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";

// رسم الباركود (الخطوط فقط) كـ SVG يملأ المساحة المتاحة له بالكامل
// value: الكود، format: CODE128 أو EAN13
// لو الكود لا يصلح لـ EAN13 (ليس 12/13 رقم) نرسمه CODE128 بدلاً منه
export default function BarcodeSvg({ value, format = "CODE128", onInvalid }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);

  // نحفظ onInvalid في ref حتى لا يعاد الرسم مع كل render للأب
  const onInvalidRef = useRef(onInvalid);
  useEffect(() => {
    onInvalidRef.current = onInvalid;
  });

  useEffect(() => {
    const svg = ref.current;
    if (!svg || !value) return;

    const draw = (fmt) => {
      let ok = true;
      JsBarcode(svg, String(value), {
        format: fmt,
        width: 2,
        height: 100,
        margin: 0,
        displayValue: false, // الرقم نكتبه نحن تحت الخطوط (بحجم يناسب الملصق)
        background: "transparent",
        valid: (v) => (ok = v),
      });
      return ok;
    };

    let ok = draw(format);
    if (!ok && format !== "CODE128") {
      onInvalidRef.current?.();
      ok = draw("CODE128");
    }
    setFailed(!ok);
    if (!ok) return;

    // نجعل الرسم يتمدد على عرض وارتفاع المساحة المتاحة
    const w = parseFloat(svg.getAttribute("width"));
    const h = parseFloat(svg.getAttribute("height"));
    if (w && h) svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("preserveAspectRatio", "none");
  }, [value, format]);

  if (failed) return <div className="barcode-svg barcode-svg--error">{value}</div>;

  return <svg ref={ref} className="barcode-svg" />;
}
