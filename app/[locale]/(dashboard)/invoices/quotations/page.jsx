// Server Component: قائمة عروض الأسعار
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId, parseListRange, parsePage } from "@/lib/purchase-pages";
import { getBranches } from "@/services/branch.service";
import { listQuotations } from "@/services/quotation.service";
import SalesList from "@/components/sales/SalesList";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("quotations.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const { q = "", page, branch, from, to } = await searchParams;
  const viewAll = can(user, "allBranches.view");
  const branchId = viewAll ? parseId(branch) : null;
  const query = String(q).slice(0, 100);
  // الفترة: النهارده لو مفيش بحث ولا فترة (مش كل الفواتير)
  const range = parseListRange({ from, to, q: query });
  const data = await listQuotations({ q: query, page: parsePage(page), user, branchId, from: range.from, to: range.to });
  const branches =
    viewAll ? await getBranches() : null;

  return (
    <SalesList
      kind="quotation"
      data={data}
      q={query}
      branches={branches}
      branchId={branchId}
      range={range}
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
