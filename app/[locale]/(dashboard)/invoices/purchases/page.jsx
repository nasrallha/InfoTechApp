// Server Component: قائمة فواتير المشتريات (بحث + صفحات)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId, parsePage } from "@/lib/purchase-pages";
import { getBranches } from "@/services/branch.service";
import {
  canViewAllBranches,
  listPurchases,
  PURCHASE,
} from "@/services/purchase.service";
import PurchasesList from "@/components/purchases/PurchasesList";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("purchases.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const { q = "", page, branch } = await searchParams;
  // المدير (عرض كل الفروع) يقدر يفلتر بفرع معيّن
  const viewAll = canViewAllBranches(user);
  const branchId = viewAll ? parseId(branch) : null;
  const query = String(q).slice(0, 100);
  const data = await listPurchases({
    type: PURCHASE,
    q: query,
    page: parsePage(page),
    user,
    branchId,
  });
  const branches = viewAll ? await getBranches() : null;

  return (
    <PurchasesList
      type={PURCHASE}
      data={data}
      q={query}
      branches={branches}
      branchId={branchId}
      canCreate={can(user, "purchases.create")}
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
