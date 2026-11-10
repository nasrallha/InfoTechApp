// السيارات (وحدة vehicles - الورش)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getSaleCustomers } from "@/services/sale-catalog.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import VehiclesView from "@/components/vehicles/VehiclesView";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("vehicles.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const q = typeof sp?.q === "string" ? sp.q.slice(0, 50) : "";
  const filter = sp?.filter === "due" ? "due" : "all";
  const customers = await getSaleCustomers(user);
  return (
    <VehiclesView
      key={`${q}|${filter}`}
      initialQ={q}
      initialFilter={filter}
      customers={customers.map(({ id, code, arName, enName, phone }) => ({
        id,
        code,
        arName,
        enName,
        phone,
      }))}
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
