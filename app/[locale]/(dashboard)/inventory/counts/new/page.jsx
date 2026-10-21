// Server Component: جرد جديد
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { getVisibleWarehouses } from "@/services/stock.service";
import { getPurchaseCategories } from "@/services/purchase.service";
import CountForm from "@/components/inventory/CountForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { user, allowed } = await getPageAccess("inventoryCounts.create");
  if (!allowed) return <NoAccess />;

  await connection();
  const [warehouses, categories] = await Promise.all([
    getVisibleWarehouses(user),
    getPurchaseCategories(),
  ]);
  return (
    <CountForm
      count={null}
      warehouses={warehouses.filter((w) => w.isActive)}
      categories={categories}
      canCreate
      canPost={can(user, "inventoryCounts.post")}
      canDelete={can(user, "inventoryCounts.delete")}
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
