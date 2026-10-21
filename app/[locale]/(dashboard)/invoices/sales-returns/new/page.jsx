// Server Component: مرتجع مبيعات جديد
// /invoices/sales-returns/new?sale=15 ← تفتح ومعها فاتورة البيع
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPurchasePaymentMethods, parseId } from "@/lib/purchase-pages";
import { getSaleForReturn } from "@/services/sale.service";
import { getOpenShift } from "@/services/shift.service";
import SaleReturnForm from "@/components/sales/SaleReturnForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("salesReturns.create");
  if (!allowed) return <NoAccess />;

  await connection();
  const { sale } = await searchParams;
  const saleId = parseId(sale);
  const [{ methods, creditMethod }, initialSale, shift] = await Promise.all([
    getPurchasePaymentMethods(),
    saleId ? getSaleForReturn(saleId, user) : null,
    getOpenShift(user),
  ]);

  return (
    <SaleReturnForm
      key={saleId ?? "new"}
      methods={methods}
      creditMethod={creditMethod}
      initialPurchase={initialSale}
      shift={shift?.branchId === user.branch.id ? shift : null}
      canChangeDate={can(user, "salesReturns.changeDate")}
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
