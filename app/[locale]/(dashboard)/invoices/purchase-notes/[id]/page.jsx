// Server Component: عرض إشعار (إشعارات الموردين) - ?print=1 ← يُطبع فور الفتح
import { Suspense } from "react";
import { NoteViewContent } from "@/lib/note-pages";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ params, searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <NoteViewContent
        side="purchase"
        params={params}
        searchParams={searchParams}
      />
    </Suspense>
  );
}
