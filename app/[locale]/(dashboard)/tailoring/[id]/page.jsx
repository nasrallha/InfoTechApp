// Server Component: طلب التفصيل (الأشخاص ومقاساتهم وتفاصيلهم + الحالة والتسليم والطباعة)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import {
  getTailorOrder,
  tailorOrderOptions,
} from "@/services/tailor-order.service";
import { getActivePaymentMethods } from "@/services/payment-method.service";
import TailorOrderDetails from "@/components/tailoring/TailorOrderDetails";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("tailorOrders.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const id = parseId((await params).id);
  if (!id) notFound();
  const [order, options, methods] = await Promise.all([
    getTailorOrder(id, user),
    tailorOrderOptions(),
    getActivePaymentMethods(),
  ]);
  if (!order) notFound();
  return (
    <TailorOrderDetails
      key={JSON.stringify([
        order.status,
        order.due,
        order.deliveryDate,
        order.technician?.id,
      ])}
      order={order}
      technicians={options.technicians}
      // الكارت: كل خانات المقاسات ورسومات التفاصيل (والمختار متعلّم)
      fields={options.fields}
      groups={options.groups}
      paymentMethods={methods.filter((m) => m.type !== "credit")}
      perms={{
        update: can(user, "tailorOrders.update"),
        deliver: can(user, "tailorOrders.deliver"),
        cancel: can(user, "tailorOrders.cancel"),
        delete: can(user, "tailorOrders.delete"),
        collect: can(user, "tailorOrders.collect"),
      }}
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
