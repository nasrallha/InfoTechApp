// Server Component: تحويل مخزني جديد (إرسال)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { getVisibleWarehouses } from "@/services/stock.service";
import {
  getActiveWarehouses,
  getBranchWarehouseId,
} from "@/services/warehouse.service";
import { getPurchaseCategories } from "@/services/purchase.service";
import TransferForm from "@/components/inventory/TransferForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { user, allowed } = await getPageAccess("transfers.create");
  if (!allowed) return <NoAccess />;

  await connection();
  const [visible, active, branchWarehouseId, categories] = await Promise.all([
    getVisibleWarehouses(user),
    getActiveWarehouses(),
    getBranchWarehouseId(user.branch.id),
    getPurchaseCategories(),
  ]);
  // يرسل من المستودعات المسموحة له (النشطة)، ويرسل لأي مستودع نشط
  const fromWarehouses = visible.filter((w) => w.isActive);
  const defaultFromId = fromWarehouses.some((w) => w.id === branchWarehouseId)
    ? branchWarehouseId
    : undefined;

  return (
    <TransferForm
      fromWarehouses={fromWarehouses}
      toWarehouses={active}
      defaultFromId={defaultFromId}
      categories={categories}
      canChangeDate={can(user, "transfers.changeDate")}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
