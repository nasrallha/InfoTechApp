// Server Component: ورديات الكاشير (?status=open&page=2&day=2026-10-30&no=2)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId, parsePage } from "@/lib/purchase-pages";
import { isDay } from "@/lib/dates";
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
  const { status, page, day, no } = await searchParams;
  const st = ["open", "closed"].includes(status) ? status : undefined;
  // البحث: يوم العمل + ترتيب الوردية فيه (?day=2026-10-30&no=2)
  const d = isDay(day) ? day : undefined;
  const dayNo = d ? parseId(no) : undefined;
  const data = await listShifts({
    user,
    status: st,
    day: d,
    dayNo,
    page: parsePage(page),
  });
  return (
    <ShiftsList
      data={data}
      status={st}
      day={d}
      dayNo={dayNo}
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
