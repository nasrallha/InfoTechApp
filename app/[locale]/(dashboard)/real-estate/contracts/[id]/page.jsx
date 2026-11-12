// Server Component: تفاصيل عقد الإيجار (الوحدات والدفعات وفواتيرها والطباعة)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getContract } from "@/services/rent-contract.service";
import { getActivePaymentMethods } from "@/services/payment-method.service";
import ContractDetails from "@/components/real-estate/ContractDetails";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("rentContracts.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const id = parseId((await params).id);
  if (!id) notFound();
  const [contract, methods] = await Promise.all([
    getContract(id, user),
    getActivePaymentMethods(),
  ]);
  if (!contract) notFound();
  return (
    <ContractDetails
      contract={contract}
      // طرق الدفع على فاتورة الدفعة (من غير «آجل»: الآجل = من غير دفع)
      paymentMethods={methods.filter((m) => m.type !== "credit")}
      perms={{
        update: can(user, "rentContracts.update"),
        create: can(user, "rentContracts.create"),
        terminate: can(user, "rentContracts.terminate"),
        invoice: can(user, "rentContracts.invoice"),
        delete: can(user, "rentContracts.delete"),
        cancelInvoice: can(user, "rentContracts.cancelInvoice"),
        editInvoice: can(user, "rentContracts.editInvoice"),
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
