// تقرير الضمانات (وحدة serials)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { warrantyCustomers } from "@/services/serial-query.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import WarrantyReportView from "@/components/serials/WarrantyReportView";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("serials.warranties");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const customerId = Number(sp?.customerId) || undefined;
  const customers = await warrantyCustomers(user);
  return (
    <WarrantyReportView
      customers={customers}
      initialCustomerId={customerId}
      initialStatus={customerId ? "all" : "active"}
    />
  );
}

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
