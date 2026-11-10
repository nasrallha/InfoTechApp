// استلام جهاز (طلب ضمان / صيانة جديد)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getSaleCustomers } from "@/services/sale-catalog.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import ClaimForm from "@/components/warranty-claims/ClaimForm";

async function Content() {
  const { user, allowed } = await getPageAccess("warrantyClaims.create");
  if (!allowed) return <NoAccess />;
  await connection();
  const customers = await getSaleCustomers(user);
  return <ClaimForm customers={customers} />;
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
