// Server Component: عرض فاتورة شراء (?print=1 ← تُطبع فور الفتح)
import { Suspense } from "react";
import { PurchaseViewContent } from "@/lib/purchase-view";
import TableSkeleton from "@/components/common/TableSkeleton";

export default function Page({ params, searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <PurchaseViewContent
        type="purchase"
        params={params}
        searchParams={searchParams}
      />
    </Suspense>
  );
}
