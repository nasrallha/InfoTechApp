// Server Component: عرض سند (?print=1 ← يُطبع فور الفتح)
import { Suspense } from "react";
import { VoucherViewContent } from "@/lib/voucher-pages";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ params, searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <VoucherViewContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
