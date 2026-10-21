// Server Component: الإدارة ← تصفير الحركات (بداية جديدة)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { getResetCounts } from "@/services/data-reset.service";
import DataResetView from "@/components/admin/DataResetView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { user, allowed } = await getPageAccess("dataReset.run");
  if (!allowed) return <NoAccess />;
  await connection();
  const counts = await getResetCounts();
  return (
    <DataResetView
      initialCounts={counts}
      canBackup={can(user, "backups.view")}
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
