"use client";
import { Spin } from "antd";

// شاشة تحميل كاملة (أثناء التأكد من الجلسة)
export default function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <Spin size="large" />
    </div>
  );
}
