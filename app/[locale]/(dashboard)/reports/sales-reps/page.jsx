// تقرير عمولات المناديب (وحدة salesReps)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { listSalesReps } from "@/services/sales-rep.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import SalesRepsReportView from "@/components/sales-reps/SalesRepsReportView";

async function Content() {
  const { user, allowed } = await getPageAccess("salesReps.commissions");
  if (!allowed) return <NoAccess />;
  await connection();
  const allBranches = can(user, "allBranches.view");
  const [reps, branches] = await Promise.all([
    listSalesReps(),
    allBranches
      ? prisma.branch.findMany({
          orderBy: { id: "asc" },
          select: { id: true, arName: true, enName: true },
        })
      : null,
  ]);
  return (
    <SalesRepsReportView
      reps={reps}
      branches={branches}
      canSaveRate={can(user, "users.update")}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
