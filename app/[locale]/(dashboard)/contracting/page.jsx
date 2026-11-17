// Server Component: عقود المقاولات (?kind=owner|sub&status=active|completed|cancelled|all&q=&page=)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { listContracts } from "@/services/contracting.service";
import ContractsList from "@/components/contracting/ContractsList";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

const STATUSES = ["active", "completed", "cancelled", "all"];

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("constructionContracts.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const kind = sp.kind === "sub" ? "sub" : "owner";
  const status = STATUSES.includes(sp.status) ? sp.status : "active";
  const q = String(sp.q ?? "").slice(0, 60);
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listContracts({ kind, status, q, page }, user);
  return (
    <ContractsList
      data={data}
      filters={{ kind, status, q }}
      canCreate={can(user, "constructionContracts.create")}
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
