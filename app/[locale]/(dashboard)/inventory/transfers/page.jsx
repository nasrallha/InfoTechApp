// Server Component: قائمة التحويلات المخزنية (?status=sent&q=TR-5&page=2)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parsePage } from "@/lib/purchase-pages";
import { listTransfers } from "@/services/inventory.service";
import TransfersList from "@/components/inventory/TransfersList";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

const STATUSES = ["sent", "received", "cancelled"];

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("transfers.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const { q = "", page, status } = await searchParams;
  const query = String(q).slice(0, 50);
  const st = STATUSES.includes(status) ? status : undefined;
  const data = await listTransfers({
    user,
    status: st,
    q: query,
    page: parsePage(page),
  });

  return (
    <TransfersList
      data={data}
      q={query}
      status={st}
      canCreate={can(user, "transfers.create")}
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
