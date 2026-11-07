// Server Component: صفحة طرق الدفع (الإعدادات)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getPaymentMethods } from "@/services/payment-method.service";
import { multiTenant } from "@/lib/tenant";
import PaymentMethodsView from "@/components/settings/payment-methods/PaymentMethodsView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function PaymentMethodsContent() {
  const { allowed } = await getPageAccess("paymentMethods.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const methods = await getPaymentMethods();
  return <PaymentMethodsView methods={methods} lockFixed={multiTenant()} />;
}

export default function PaymentMethodsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <PaymentMethodsContent />
    </Suspense>
  );
}
