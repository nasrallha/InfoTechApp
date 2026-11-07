// تقرير المتابعات في فترة (وحدة followUps)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getBranches } from "@/services/branch.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import FollowUpReportView from "@/components/follow-ups/FollowUpReportView";

async function Content() {
  const { user, allowed } = await getPageAccess("followUps.view");
  if (!allowed) return <NoAccess />;
  await connection();
  // اختيار الفرع لصاحب صلاحية كل الفروع بس
  const branches = can(user, "allBranches.view")
    ? (await getBranches()).map(({ id, arName, enName }) => ({
        id,
        arName,
        enName,
      }))
    : [];
  return <FollowUpReportView branches={branches} />;
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
