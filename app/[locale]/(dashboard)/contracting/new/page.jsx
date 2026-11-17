// Server Component: عقد مقاولات جديد (?kind=owner|sub، ?copy=<رقم عقد> = نسخ المقايسة والنسب من عقد سابق)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { contractFormOptions, getContract } from "@/services/contracting.service";
import ContractForm from "@/components/contracting/ContractForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("constructionContracts.create");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const kind = sp.kind === "sub" ? "sub" : "owner";
  const copyId = parseId(sp.copy);
  const [options, copyFrom] = await Promise.all([
    contractFormOptions(user, kind),
    copyId ? getContract(copyId, user) : null,
  ]);
  return <ContractForm options={options} copyFrom={copyFrom} />;
}

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
