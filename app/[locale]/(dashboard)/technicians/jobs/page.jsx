// المواعيد: تركيبات وخدمات الفواتير + زيارات عقود الصيانة
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { techniciansIfEnabled } from "@/services/technician.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import JobsView from "@/components/technicians/JobsView";

async function Content() {
  const { user } = await getPageAccess();
  if (
    !can(user, "technicians.jobs") &&
    !can(user, "maintenanceContracts.visits")
  )
    return <NoAccess />;
  await connection();
  const technicians = await techniciansIfEnabled();
  return <JobsView technicians={technicians} />;
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
