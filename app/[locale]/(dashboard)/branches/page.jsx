// Server Component: يجيب الفروع من قاعدة البيانات ويرسلها جاهزة
import { Suspense } from "react";
import { getPageAccess } from "@/lib/auth";
import NoAccess from "@/components/common/NoAccess";
import { connection } from "next/server";
import { getBranches } from "@/services/branch.service";
import { getActiveWarehouses } from "@/services/warehouse.service";
import { getActivePriceLists } from "@/services/price-list.service";
import BranchesView from "@/components/branches/BranchesView";
import TableSkeleton from "@/components/common/TableSkeleton";

async function BranchesContent() {
  // لازم يكون مسجل دخول ويملك صلاحية "branches.view"
  const { allowed } = await getPageAccess("branches.view");
  if (!allowed) return <NoAccess />;

  // البيانات تتغير، فنجلبها مع كل طلب وليس وقت البناء
  await connection();
  const [branches, warehouses, priceLists] = await Promise.all([
    getBranches(),
    getActiveWarehouses(),
    getActivePriceLists(),
  ]);
  return (
    <BranchesView
      branches={branches}
      warehouses={warehouses}
      priceLists={priceLists}
    />
  );
}

export default function BranchesPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <BranchesContent />
    </Suspense>
  );
}
