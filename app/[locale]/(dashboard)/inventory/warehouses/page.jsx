// Server Component: المستودعات
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getWarehouses } from "@/services/warehouse.service";
import WarehousesView from "@/components/inventory/WarehousesView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { allowed } = await getPageAccess("warehouses.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const warehouses = await getWarehouses();
  return <WarehousesView warehouses={warehouses} />;
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
