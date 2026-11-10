// Server Component: تعديل سند (قبض / صرف / تسوية) بصلاحية "تعديل" لنوعه
import { Suspense } from "react";
import { VoucherEditContent } from "@/lib/voucher-pages";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ params }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <VoucherEditContent params={params} />
    </Suspense>
  );
}
