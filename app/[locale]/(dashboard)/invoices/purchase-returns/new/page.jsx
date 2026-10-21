// Server Component: مرتجع مشتريات جديد
// /invoices/purchase-returns/new?purchase=15 ← تفتح ومعها فاتورة الشراء
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { getPurchasePaymentMethods, parseId } from "@/lib/purchase-pages";
import { getPurchaseForReturn } from "@/services/purchase.service";
import PurchaseReturnForm from "@/components/purchases/PurchaseReturnForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("purchaseReturns.create");
  if (!allowed) return <NoAccess />;

  await connection();
  const { purchase } = await searchParams;
  const purchaseId = parseId(purchase);

  const [{ methods, creditMethod }, initialPurchase] = await Promise.all([
    getPurchasePaymentMethods(),
    purchaseId ? getPurchaseForReturn(purchaseId, user) : null,
  ]);

  return (
    <PurchaseReturnForm
      key={purchaseId ?? "new"}
      methods={methods}
      creditMethod={creditMethod}
      canChangeDate={can(user, "purchaseReturns.changeDate")}
      initialPurchase={initialPurchase}
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
