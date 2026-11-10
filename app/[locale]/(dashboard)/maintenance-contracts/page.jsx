// عقود الصيانة الدورية (وحدة maintenanceContracts)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getSaleCustomers } from "@/services/sale-catalog.service";
import { techniciansIfEnabled } from "@/services/technician.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import ContractsView from "@/components/maintenance-contracts/ContractsView";

async function Content() {
  const { user, allowed } = await getPageAccess("maintenanceContracts.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const [customers, technicians] = await Promise.all([
    getSaleCustomers(user),
    techniciansIfEnabled(),
  ]);
  return <ContractsView customers={customers} technicians={technicians} />;
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
