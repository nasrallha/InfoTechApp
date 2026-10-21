// Server Component: تعديل فاتورة بيع
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getPurchasePaymentMethods, parseId } from "@/lib/purchase-pages";
import { salePerms } from "@/lib/sale-pages";
import {
  getSaleCategories,
  getSaleCustomers,
} from "@/services/sale-catalog.service";
import { getSaleForEdit } from "@/services/sale.service";
import SaleForm from "@/components/sales/SaleForm";
import { getActivePromotions } from "@/services/promotion.service";
import { dayOf } from "@/lib/dates";
import {
  getBranchZatcaInfo,
  isSaleSigned,
} from "@/services/zatca-invoice.service";
import ZatcaLocked from "@/components/zatca/ZatcaLocked";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("sales.update");
  if (!allowed) return <NoAccess />;

  await connection();
  const { id } = await params;
  const saleId = parseId(id);
  if (!saleId) notFound();

  const [sale, customers, categories, { methods, creditMethod }] =
    await Promise.all([
      getSaleForEdit(saleId, user),
      getSaleCustomers(),
      getSaleCategories(),
      getPurchasePaymentMethods(),
    ]);
  if (!sale) notFound();
  // اتوقّعت للزكاة: مقفولة (التصحيح بمرتجع)
  if (await isSaleSigned(saleId)) return <ZatcaLocked saleId={saleId} />;
  const zatca = await getBranchZatcaInfo(sale.branch?.id ?? user.branch.id);
  // العروض اللي كانت شغالة يوم الفاتورة
  const promotions = await getActivePromotions(
    sale.branch?.id ?? user.branch.id,
    dayOf(sale.date),
  );

  return (
    <SaleForm
      mode="sale"
      sale={sale}
      customers={customers}
      categories={categories}
      methods={methods}
      creditMethod={creditMethod}
      perms={salePerms(user)}
      promotions={promotions}
      zatca={zatca}
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
