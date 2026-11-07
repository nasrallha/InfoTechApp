// Server Component: قائمة التوالف والزيادات (?type=damage&q=AJ-5&page=2)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parsePage } from "@/lib/purchase-pages";
import { listAdjustments } from "@/services/stock-adjustment.service";
import AdjustmentsList from "@/components/inventory/AdjustmentsList";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

const TYPES = ["damage", "surplus"];

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("stockAdjustments.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const { q = "", page, type } = await searchParams;
  const query = String(q).slice(0, 50);
  const ty = TYPES.includes(type) ? type : undefined;
  const data = await listAdjustments({
    user,
    type: ty,
    q: query,
    page: parsePage(page),
  });

  return (
    <AdjustmentsList
      data={data}
      q={query}
      type={ty}
      canCreate={can(user, "stockAdjustments.create")}
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
