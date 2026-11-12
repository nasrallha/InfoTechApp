// Server Component: تعديل عقد إيجار
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { contractFormOptions, getContract } from "@/services/rent-contract.service";
import ContractForm from "@/components/real-estate/ContractForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("rentContracts.update");
  if (!allowed) return <NoAccess />;
  await connection();
  const id = parseId((await params).id);
  if (!id) notFound();
  const [contract, options] = await Promise.all([
    getContract(id, user),
    contractFormOptions(user, id),
  ]);
  if (!contract) notFound();
  return <ContractForm options={options} contract={contract} />;
}

export default function Page({ params }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
