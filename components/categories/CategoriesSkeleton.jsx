"use client";
import { Skeleton } from "antd";

// شكل مؤقت يظهر أثناء تحميل الأقسام من السيرفر
export default function CategoriesSkeleton() {
  return (
    <div style={{ maxWidth: 600, margin: "40px auto" }}>
      <Skeleton active paragraph={{ rows: 6 }} />
    </div>
  );
}
