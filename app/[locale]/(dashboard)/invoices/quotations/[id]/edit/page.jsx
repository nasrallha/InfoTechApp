// Server Component: تعديل عرض سعر (المفتوح فقط)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { quotationPerms } from "@/lib/sale-pages";
import {
  getSaleCategories,
  getSaleCustomers,
} from "@/services/sale-catalog.service";
import { getQuotationForForm } from "@/services/quotation.service";
import SaleForm from "@/components/sales/SaleForm";
import { getActivePromotions } from "@/services/promotion.service";
import { dayOf } from "@/lib/dates";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("quotations.update");
  if (!allowed) return <NoAccess />;

  await connection();
  const { id } = await params;
  const quotationId = parseId(id);
  if (!quotationId) notFound();
  const [quotation, customers, categories] = await Promise.all([
    getQuotationForForm(quotationId, user),
    getSaleCustomers(user),
    getSaleCategories(),
  ]);
  if (!quotation || quotation.status !== "open") notFound();
  // العروض اللي كانت شغالة يوم العرض
  const promotions = await getActivePromotions(
    quotation.branch?.id ?? user.branch.id,
    quotation.date ? dayOf(quotation.date) : undefined,
  );

  return (
    <SaleForm
      mode="quotation"
      quotation={quotation}
      customers={customers}
      categories={categories}
      perms={quotationPerms(user)}
      promotions={promotions}
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
