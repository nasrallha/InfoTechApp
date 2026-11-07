// Server Component: مستند تالف / زيادة جديد (?type=damage | surplus)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { getVisibleWarehouses } from "@/services/stock.service";
import { getBranchWarehouseId } from "@/services/warehouse.service";
import { getPurchaseCategories } from "@/services/purchase.service";
import AdjustmentForm from "@/components/inventory/AdjustmentForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("stockAdjustments.create");
  if (!allowed) return <NoAccess />;

  await connection();
  const { type } = await searchParams;
  const [visible, branchWarehouseId, categories] = await Promise.all([
    getVisibleWarehouses(user),
    getBranchWarehouseId(user.branch.id),
    getPurchaseCategories(),
  ]);
  const warehouses = visible.filter((w) => w.isActive);
  const defaultWarehouseId = warehouses.some((w) => w.id === branchWarehouseId)
    ? branchWarehouseId
    : undefined;

  return (
    <AdjustmentForm
      // النوع بيتغير من اللينك: نعيد بناء الفورم
      key={type === "surplus" ? "surplus" : "damage"}
      warehouses={warehouses}
      defaultWarehouseId={defaultWarehouseId}
      categories={categories}
      canChangeDate={can(user, "stockAdjustments.changeDate")}
      initialType={type === "surplus" ? "surplus" : "damage"}
    />
  );
}

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
