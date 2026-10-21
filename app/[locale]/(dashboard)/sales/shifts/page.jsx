// Server Component: ورديات الكاشير (?status=open&page=2)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parsePage } from "@/lib/purchase-pages";
import { listShifts } from "@/services/shift.service";
import { ShiftsList } from "@/components/sales/ShiftsView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user } = await getPageAccess();
  if (!user || (!can(user, "shifts.view") && !can(user, "sales.pos"))) {
    return <NoAccess />;
  }
  await connection();
  const { status, page } = await searchParams;
  const st = ["open", "closed"].includes(status) ? status : undefined;
  const data = await listShifts({ user, status: st, page: parsePage(page) });
  return <ShiftsList data={data} status={st} canPos={can(user, "sales.pos")} />;
}

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
