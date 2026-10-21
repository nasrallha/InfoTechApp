// Server Component: تعديل فاتورة شراء
// (ممنوع لو عليها مرتجعات: لازم تُحذف المرتجعات أولاً)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { getPurchasePaymentMethods, parseId } from "@/lib/purchase-pages";
import {
  getPurchaseCategories,
  getPurchaseForEdit,
  getPurchaseSuppliers,
} from "@/services/purchase.service";
import { getSystemSettings } from "@/services/system-settings.service";
import {
  getActiveWarehouses,
  getBranchWarehouseId,
} from "@/services/warehouse.service";
import PurchaseForm from "@/components/purchases/PurchaseForm";
import PurchaseLocked from "@/components/purchases/PurchaseLocked";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("purchases.update");
  if (!allowed) return <NoAccess />;

  await connection();
  const { id } = await params;
  const purchaseId = parseId(id);
  if (!purchaseId) notFound();

  const purchase = await getPurchaseForEdit(purchaseId, user);
  if (!purchase) notFound();
  if (purchase.hasReturns) return <PurchaseLocked purchase={purchase} />;

  const [
    suppliers,
    { methods, creditMethod },
    settings,
    categories,
    warehouses,
    defaultWarehouseId,
  ] = await Promise.all([
    getPurchaseSuppliers(),
    getPurchasePaymentMethods(),
    getSystemSettings(),
    getPurchaseCategories(),
    getActiveWarehouses(),
    getBranchWarehouseId(user.branch.id),
  ]);

  // مورد الفاتورة لو أصبح موقوفاً: نضيفه للقائمة حتى يظهر اسمه
  const list = suppliers.some((s) => s.id === purchase.supplierId)
    ? suppliers
    : [
        ...suppliers,
        {
          id: purchase.supplierId,
          code: "",
          arName: purchase.supplierArName,
          enName: purchase.supplierEnName,
          taxNo: purchase.supplierTaxNo,
        },
      ];

  return (
    <PurchaseForm
      purchase={purchase}
      suppliers={list}
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

export default function Page({ params }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
