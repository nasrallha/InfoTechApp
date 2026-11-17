// Server Component: تعديل عقد مقاولات
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { contractFormOptions, getContract } from "@/services/contracting.service";
import ContractForm from "@/components/contracting/ContractForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("constructionContracts.update");
  if (!allowed) return <NoAccess />;
  await connection();
  const id = parseId((await params).id);
  if (!id) notFound();
  const contract = await getContract(id, user);
  if (!contract) notFound();
  const options = await contractFormOptions(user, contract.kind);
  return <ContractForm options={options} contract={contract} />;
}

export default function Page({ params }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
