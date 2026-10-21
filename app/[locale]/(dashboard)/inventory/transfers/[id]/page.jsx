// Server Component: عرض تحويل مخزني (استلام / إلغاء / طباعة)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getTransfer } from "@/services/inventory.service";
import { getCompany } from "@/services/company.service";
import TransferDetails from "@/components/inventory/TransferDetails";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("transfers.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const { id } = await params;
  const transferId = parseId(id);
  if (!transferId) notFound();

  const [transfer, company] = await Promise.all([
    getTransfer(transferId, user),
    getCompany(),
  ]);
  if (!transfer) notFound();

  return (
    <TransferDetails
      transfer={transfer}
      company={company}
      canReceive={can(user, "transfers.receive")}
      canCancel={can(user, "transfers.cancel")}
      canCreate={can(user, "transfers.create")}
    />
  );
}

export default function Page({ params }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
