// Server Component: قائمة إشعارات الموردين (دائن / مدين)
import { Suspense } from "react";
import { NotesListContent } from "@/lib/note-pages";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <NotesListContent side="purchase" searchParams={searchParams} />
    </Suspense>
  );
}
