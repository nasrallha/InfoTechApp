"use client";

// ============================================================
// إخفاء تحذير مزعج وغير ضار في وضع التطوير فقط
// "trigger element and popup element should in same shadow root"
//
// السبب: Next.js 16 (cacheComponents) يحتفظ بالصفحة السابقة مخفية في الخلفية
// ولما ترجع لها، مكونات antd التي لها نافذة منبثقة (فلاتر الجدول، Popconfirm، Select)
// تفحص مكانها قبل أن ترجع الصفحة كاملة للشاشة، فيظهر التحذير. لا يؤثر على أي شيء.
//
// الكود يعمل في المتصفح ووضع التطوير فقط، وأي تحذير أو خطأ آخر يظهر عادي
// ============================================================

const IGNORED = ["trigger element and popup element should in same shadow root"];

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production" && !window.__devWarningsFiltered) {
  window.__devWarningsFiltered = true;

  const isIgnored = (args) =>
    args.some((a) => typeof a === "string" && IGNORED.some((msg) => a.includes(msg)));

  for (const method of ["error", "warn"]) {
    const original = console[method];
    console[method] = (...args) => {
      if (isIgnored(args)) return;
      original.apply(console, args);
    };
  }
}

export default function SilenceDevWarnings() {
  return null;
}
