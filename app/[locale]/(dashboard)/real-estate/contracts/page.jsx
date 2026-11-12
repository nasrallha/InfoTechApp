// Server Component: عقود الإيجار (?status=active|ended|terminated|all&q=&page=)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { listContracts } from "@/services/rent-contract.service";
import ContractsList from "@/components/real-estate/ContractsList";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

const STATUSES = ["active", "ended", "terminated", "all"];

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("rentContracts.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status) ? sp.status : "active";
  const q = String(sp.q ?? "").slice(0, 60);
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listContracts({ status, q, page }, user);
  return (
    <ContractsList
      data={data}
      filters={{ status, q }}
      canCreate={can(user, "rentContracts.create")}
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
