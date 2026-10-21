// Server Component: قائمة الجرد (?page=2)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parsePage } from "@/lib/purchase-pages";
import { listCounts } from "@/services/inventory.service";
import CountsList from "@/components/inventory/CountsList";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("inventoryCounts.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const { page } = await searchParams;
  const data = await listCounts({ user, page: parsePage(page) });
  return (
    <CountsList data={data} canCreate={can(user, "inventoryCounts.create")} />
  );
}

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
