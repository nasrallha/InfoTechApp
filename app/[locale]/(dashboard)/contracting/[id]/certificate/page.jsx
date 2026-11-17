// Server Component: مستخلص جديد على العقد
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getContract } from "@/services/contracting.service";
import { getActivePaymentMethods } from "@/services/payment-method.service";
import { getActiveUnits } from "@/services/unit.service";
import CertificateForm from "@/components/contracting/CertificateForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("constructionContracts.invoice");
  if (!allowed) return <NoAccess />;
  await connection();
  const id = parseId((await params).id);
  if (!id) notFound();
  const [contract, methods, units] = await Promise.all([getContract(id, user), getActivePaymentMethods(), getActiveUnits()]);
  if (!contract) notFound();
  // السداد على فاتورة المستخلص (من غير «آجل»: الآجل اختيار لوحده)
  return (
    <CertificateForm contract={contract} paymentMethods={methods.filter((m) => m.type !== "credit")} units={units} />
  );
}

export default function Page({ params }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
