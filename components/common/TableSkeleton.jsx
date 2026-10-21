"use client";
import { Skeleton } from "antd";

// شكل مؤقت يظهر أثناء تحميل بيانات أي جدول من السيرفر
export default function TableSkeleton() {
  return (
    <div style={{ margin: "40px auto" }}>
      <Skeleton active title={false} paragraph={{ rows: 1, width: "30%" }} />
      <Skeleton active paragraph={{ rows: 8 }} />
    </div>
  );
}
