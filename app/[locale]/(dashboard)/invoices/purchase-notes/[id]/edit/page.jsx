// Server Component: تعديل إشعار (قبل توقيعه للهيئة) بصلاحية "تعديل"
import { Suspense } from "react";
import { NoteEditContent } from "@/lib/note-pages";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ params }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <NoteEditContent side="purchase" params={params} />
    </Suspense>
  );
}
