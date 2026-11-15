// Server Component: طلب تفصيل جديد (?customer= ← العميل جاهز من شاشة العملاء)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { tailorOrderOptions } from "@/services/tailor-order.service";
import { getTailorCustomer } from "@/services/tailoring.service";
import { getActivePaymentMethods } from "@/services/payment-method.service";
import TailorOrderForm from "@/components/tailoring/TailorOrderForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { allowed } = await getPageAccess("tailorOrders.create");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const customerId = parseId(sp.customer);
  const [options, methods, customer] = await Promise.all([
    tailorOrderOptions(),
    getActivePaymentMethods(),
    customerId ? getTailorCustomer(customerId) : null,
  ]);
  return (
    <TailorOrderForm
      key={customerId ?? "new"}
      options={options}
      // العربون على الفاتورة (من غير «آجل»: الآجل = من غير دفع)
      paymentMethods={methods.filter((m) => m.type !== "credit")}
      initialCustomer={customer}
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
