// تقرير عمولات الفنيين (وحدة technicians)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getTechnicians } from "@/services/technician.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import CommissionsView from "@/components/technicians/CommissionsView";

async function Content() {
  const { allowed } = await getPageAccess("technicians.commissions");
  if (!allowed) return <NoAccess />;
  await connection();
  const technicians = await getTechnicians();
  return <CommissionsView technicians={technicians} />;
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
