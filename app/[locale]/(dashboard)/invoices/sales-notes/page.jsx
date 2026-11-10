// Server Component: قائمة إشعارات العملاء (دائن / مدين)
import { Suspense } from "react";
import { NotesListContent } from "@/lib/note-pages";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <NotesListContent side="sale" searchParams={searchParams} />
    </Suspense>
  );
}
