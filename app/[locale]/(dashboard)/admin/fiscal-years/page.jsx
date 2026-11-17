// Server Component: الإدارة ← السنوات المالية (ترقيم المستندات لكل سنة + الإقفال)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { listFiscalYears } from "@/services/fiscal-year.service";
import FiscalYearsView from "@/components/admin/FiscalYearsView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { user, allowed } = await getPageAccess("fiscalYears.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const data = await listFiscalYears();
  return (
    <FiscalYearsView
      data={data}
      perms={{ close: can(user, "fiscalYears.close"), manage: can(user, "fiscalYears.manage") }}
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
