// Server Component: تعديل طلب تفصيل (نفس الرقم والفاتورة) - tailorOrders.update
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { OPEN_STATUSES } from "@/lib/tailoring";
import {
  getTailorOrderForEdit,
  tailorOrderOptions,
} from "@/services/tailor-order.service";
import { getTailorCustomer } from "@/services/tailoring.service";
import { getActivePaymentMethods } from "@/services/payment-method.service";
import TailorOrderForm from "@/components/tailoring/TailorOrderForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("tailorOrders.update");
  if (!allowed) return <NoAccess />;
  await connection();
  const id = parseId((await params).id);
  if (!id) notFound();
  const order = await getTailorOrderForEdit(id, user);
  // المسلَّم والملغي مبيتعدلش
  if (!order || !OPEN_STATUSES.includes(order.status)) notFound();
  const [options, methods, customer] = await Promise.all([
    tailorOrderOptions(),
    getActivePaymentMethods(),
    getTailorCustomer(order.customerId),
  ]);
  return (
    <TailorOrderForm
      options={options}
      paymentMethods={methods.filter((m) => m.type !== "credit")}
      initialCustomer={customer}
      editOrder={order}
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
