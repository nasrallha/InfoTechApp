// Server Component: أرصدة المخزون وكارت الصنف
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getVisibleWarehouses } from "@/services/stock.service";
import { getPurchaseCategories } from "@/services/purchase.service";
import StockView from "@/components/inventory/StockView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { user, allowed } = await getPageAccess("stock.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const [warehouses, categories] = await Promise.all([
    getVisibleWarehouses(user),
    getPurchaseCategories(),
  ]);
  return <StockView warehouses={warehouses} categories={categories} />;
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
