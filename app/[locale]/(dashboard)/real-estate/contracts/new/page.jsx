// Server Component: عقد إيجار جديد (?renew=<رقم العقد> = تجديد عقد بنفس بياناته)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { contractFormOptions, getContract } from "@/services/rent-contract.service";
import ContractForm from "@/components/real-estate/ContractForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("rentContracts.create");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const renewId = parseId(sp.renew);
  const [options, renewFrom] = await Promise.all([
    contractFormOptions(user),
    renewId ? getContract(renewId, user) : null,
  ]);
  return <ContractForm options={options} renewFrom={renewFrom} />;
}

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
