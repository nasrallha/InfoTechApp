// Server Component: سند جديد (receipt)
import { Suspense } from "react";
import { VoucherNewContent } from "@/lib/voucher-pages";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <VoucherNewContent type="receipt" searchParams={searchParams} />
    </Suspense>
  );
}
