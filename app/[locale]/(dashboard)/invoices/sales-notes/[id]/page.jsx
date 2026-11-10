// Server Component: عرض إشعار (إشعارات العملاء) - ?print=1 ← يُطبع فور الفتح
import { Suspense } from "react";
import { NoteViewContent } from "@/lib/note-pages";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ params, searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <NoteViewContent
        side="sale"
        params={params}
        searchParams={searchParams}
      />
    </Suspense>
  );
}
