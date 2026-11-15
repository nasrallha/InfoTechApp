// Server Component: طلبات التفصيل (?status=&q=&from=&to=&dateBy=&tailor=&page=)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { isDay } from "@/lib/dates";
import { parseId } from "@/lib/purchase-pages";
import { ORDER_STATUSES } from "@/lib/tailoring";
import {
  listTailorOrders,
  tailorOrderOptions,
} from "@/services/tailor-order.service";
import { getActivePaymentMethods } from "@/services/payment-method.service";
import TailorOrdersList from "@/components/tailoring/TailorOrdersList";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

const STATUSES = ["open", "late", "all", ...ORDER_STATUSES];

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("tailorOrders.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const filters = {
    status: STATUSES.includes(sp.status) ? sp.status : "open",
    q: String(sp.q ?? "").slice(0, 100),
    from: isDay(sp.from) ? sp.from : null,
    to: isDay(sp.to) ? sp.to : null,
    dateBy: sp.dateBy === "delivery" ? "delivery" : "order",
    technicianId: parseId(sp.tailor),
    page: Math.max(1, Number(sp.page) || 1),
  };
  const canCollect = can(user, "tailorOrders.collect");
  const [data, options, methods] = await Promise.all([
    listTailorOrders(filters, user),
    tailorOrderOptions(),
    canCollect ? getActivePaymentMethods() : [],
  ]);
  return (
    <TailorOrdersList
      key={JSON.stringify(filters)}
      data={data}
      filters={filters}
      technicians={options.technicians}
      fields={options.fields}
      groups={options.groups}
      canCreate={can(user, "tailorOrders.create")}
      canUpdate={can(user, "tailorOrders.update")}
      canCollect={canCollect}
      canDelete={can(user, "tailorOrders.delete")}
      canDeliver={can(user, "tailorOrders.deliver")}
      paymentMethods={methods.filter((m) => m.type !== "credit")}
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
