// Server Component: مستخلص سريع جديد (من غير عقد)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { activeOwnerContracts, contractFormOptions } from "@/services/contracting.service";
import { getActivePaymentMethods } from "@/services/payment-method.service";
import { getActiveUnits } from "@/services/unit.service";
import QuickCertificateForm from "@/components/contracting/QuickCertificateForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { user, allowed } = await getPageAccess("constructionContracts.invoice");
  if (!allowed) return <NoAccess />;
  await connection();
  const [options, methods, units, contracts] = await Promise.all([
    contractFormOptions(user, "owner"),
    getActivePaymentMethods(),
    getActiveUnits(),
    activeOwnerContracts(user),
  ]);
  return (
    <QuickCertificateForm
      options={{ parties: options.parties, taxRate: options.taxRate }}
      // السداد على الفاتورة (من غير «آجل»: الآجل اختيار لوحده)
      paymentMethods={methods.filter((m) => m.type !== "credit")}
      units={units}
      contracts={contracts}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
