// Server Component: عملاء الخياط (الأشخاص والمقاسات) - ?customer= يفتح عميل
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { tailorOrderOptions } from "@/services/tailor-order.service";
import { getTailorCustomer } from "@/services/tailoring.service";
import TailorCustomersView from "@/components/tailoring/TailorCustomersView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("tailoring.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const customerId = parseId(sp.customer);
  const [options, customer] = await Promise.all([
    tailorOrderOptions(),
    customerId ? getTailorCustomer(customerId) : null,
  ]);
  return (
    <TailorCustomersView
      fields={options.fields}
      initial={customer}
      canManage={can(user, "tailoring.measurements")}
      canOrder={can(user, "tailorOrders.create")}
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
