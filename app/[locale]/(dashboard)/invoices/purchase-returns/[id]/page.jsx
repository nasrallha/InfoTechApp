// Server Component: عرض مرتجع مشتريات (?print=1 ← يُطبع فور الفتح)
import { Suspense } from "react";
import { PurchaseViewContent } from "@/lib/purchase-view";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ params, searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <PurchaseViewContent
        type="return"
        params={params}
        searchParams={searchParams}
      />
    </Suspense>
  );
}
