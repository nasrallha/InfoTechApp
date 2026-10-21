// Server Component: قائمة عروض الأسعار
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId, parsePage } from "@/lib/purchase-pages";
import { getBranches } from "@/services/branch.service";
import { listQuotations } from "@/services/quotation.service";
import SalesList from "@/components/sales/SalesList";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("quotations.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const { q = "", page, branch } = await searchParams;
  const viewAll = can(user, "allBranches.view");
  const branchId = viewAll ? parseId(branch) : null;
  const query = String(q).slice(0, 100);
  const data = await listQuotations({ q: query, page: parsePage(page), user });
  const branches =
    viewAll && "quotation" !== "quotation" ? await getBranches() : null;

  return (
    <SalesList
      kind="quotation"
      data={data}
      q={query}
      branches={branches}
      branchId={branchId}
      canCreate={can(user, "quotations.create")}
      canPos={can(user, "sales.pos")}
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
