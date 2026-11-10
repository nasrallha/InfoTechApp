// Server Component: عرض سعر جديد
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { quotationPerms } from "@/lib/sale-pages";
import {
  getSaleCategories,
  getSaleCustomers,
} from "@/services/sale-catalog.service";
import SaleForm from "@/components/sales/SaleForm";
import { getActivePromotions } from "@/services/promotion.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { user, allowed } = await getPageAccess("quotations.create");
  if (!allowed) return <NoAccess />;

  await connection();
  const [customers, categories, promotions] = await Promise.all([
    getSaleCustomers(user),
    getSaleCategories(),
    getActivePromotions(user.branch.id),
  ]);
  return (
    <SaleForm
      mode="quotation"
      customers={customers}
      categories={categories}
      perms={quotationPerms(user)}
      promotions={promotions}
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
