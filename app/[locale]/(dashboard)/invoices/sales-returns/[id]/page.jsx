// Server Component: عرض مرتجع مبيعات (?print=1 ← تُطبع فور الفتح)
import { Suspense } from "react";
import { SaleViewContent } from "@/lib/sale-view";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ params, searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <SaleViewContent
        type="return"
        params={params}
        searchParams={searchParams}
      />
    </Suspense>
  );
}
