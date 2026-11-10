// Server Component: قائمة سندات المقاصة (العميل اللي هو مورد)
import { Suspense } from "react";
import { VoucherListContent } from "@/lib/voucher-pages";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <VoucherListContent type="offset" searchParams={searchParams} />
    </Suspense>
  );
}
