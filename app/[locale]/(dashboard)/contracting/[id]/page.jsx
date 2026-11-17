// Server Component: تفاصيل عقد المقاولات (المقايسة والمستخلصات وأوامر التغيير والتحصيل والطباعة)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getContract } from "@/services/contracting.service";
import { getActivePaymentMethods } from "@/services/payment-method.service";
import { getActiveUnits } from "@/services/unit.service";
import ContractDetails from "@/components/contracting/ContractDetails";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("constructionContracts.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const id = parseId((await params).id);
  if (!id) notFound();
  const [contract, methods, units] = await Promise.all([getContract(id, user), getActivePaymentMethods(), getActiveUnits()]);
  if (!contract) notFound();
  return (
    <ContractDetails
      contract={contract}
      // التحصيل / السداد بسند (من غير «آجل»)
      paymentMethods={methods.filter((m) => m.type !== "credit")}
      units={units}
      perms={{
        update: can(user, "constructionContracts.update"),
        delete: can(user, "constructionContracts.delete"),
        changeOrders: can(user, "constructionContracts.changeOrders"),
        invoice: can(user, "constructionContracts.invoice"),
        editInvoice: can(user, "constructionContracts.editInvoice"),
        cancelInvoice: can(user, "constructionContracts.cancelInvoice"),
        payments: can(user, "constructionContracts.payments"),
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
