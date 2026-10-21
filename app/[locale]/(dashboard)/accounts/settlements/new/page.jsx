// Server Component: سند جديد (settlement)
import { Suspense } from "react";
import { VoucherNewContent } from "@/lib/voucher-pages";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <VoucherNewContent type="settlement" searchParams={searchParams} />
    </Suspense>
  );
}
