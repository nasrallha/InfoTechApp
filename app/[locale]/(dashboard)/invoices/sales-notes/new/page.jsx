// Server Component: إشعار جديد (إشعارات العملاء)
// ?type=credit|debit&sale=ID ← تفتح ومعها الفاتورة الأصلية
import { Suspense } from "react";
import { NoteNewContent } from "@/lib/note-pages";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <NoteNewContent side="sale" searchParams={searchParams} />
    </Suspense>
  );
}
