"use client";
import { useEffect, useRef, useState } from "react";

// يعرض المحتوى مصغّراً/مكبّراً بنسبة scale، ويضبط ارتفاع المساحة حسب المحتوى الحقيقي
// width: عرض المحتوى الحقيقي بالبكسل
export default function ScaledBox({ width, scale, children, className = "" }) {
  const inner = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={className}
      style={{
        width: width * scale,
        height: height * scale,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* مثبّت من الشمال: في الصفحات العربية (RTL) العنصر كان بيتحاذى يمين
          وبعدين يتكبّر/يتصغّر من الشمال، فكان المستند بيزحف ويتقص من جنب */}
      <div
        ref={inner}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
