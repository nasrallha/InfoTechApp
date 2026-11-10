// Server Component: إشعار جديد (إشعارات الموردين)
// ?type=credit|debit&purchase=ID ← تفتح ومعها الفاتورة الأصلية
import { Suspense } from "react";
import { NoteNewContent } from "@/lib/note-pages";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <NoteNewContent side="purchase" searchParams={searchParams} />
    </Suspense>
  );
}
