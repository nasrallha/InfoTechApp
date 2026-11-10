// Server Component: فاتورة شراء جديدة
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { getPurchasePaymentMethods } from "@/lib/purchase-pages";
import {
  getPurchaseCategories,
  getPurchaseSuppliers,
} from "@/services/purchase.service";
import { getSystemSettings } from "@/services/system-settings.service";
import {
  getActiveWarehouses,
  getBranchWarehouseId,
} from "@/services/warehouse.service";
import PurchaseForm from "@/components/purchases/PurchaseForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { user, allowed } = await getPageAccess("purchases.create");
  if (!allowed) return <NoAccess />;

  await connection();
  const [
    suppliers,
    { methods, creditMethod },
    settings,
    categories,
    warehouses,
    defaultWarehouseId,
  ] = await Promise.all([
    getPurchaseSuppliers(user),
    getPurchasePaymentMethods(),
    getSystemSettings(),
    getPurchaseCategories(),
    getActiveWarehouses(),
    getBranchWarehouseId(user.branch.id),
  ]);

  return (
    <PurchaseForm
      suppliers={suppliers}
      categories={categories}
      methods={methods}
      creditMethod={creditMethod}
      defaultTaxMode={settings.purchaseTaxMode}
      canChangeTaxMode={can(user, "purchases.changeTaxMode")}
      canChangeDate={can(user, "purchases.changeDate")}
      warehouses={warehouses}
      defaultWarehouseId={defaultWarehouseId}
      canChooseWarehouse={can(user, "purchases.chooseWarehouse")}
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
