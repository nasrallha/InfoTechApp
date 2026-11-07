// تفاصيل عقد الصيانة وزياراته
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getContract } from "@/services/maintenance-contract.service";
import { techniciansIfEnabled } from "@/services/technician.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import ContractDetails from "@/components/maintenance-contracts/ContractDetails";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("maintenanceContracts.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const { id } = await params;
  const contractId = parseId(id);
  if (!contractId) notFound();
  const [contract, technicians] = await Promise.all([
    getContract(contractId, user),
    techniciansIfEnabled(),
  ]);
  if (!contract) notFound();
  return <ContractDetails contract={contract} technicians={technicians} />;
}

export default function Page({ params }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
