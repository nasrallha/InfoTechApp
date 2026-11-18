// Server Component: تعديل فاتورة بيع
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { contractingDocOf } from "@/services/contract-certificate.service";
import { getActiveUnits } from "@/services/unit.service";
import CertificateInvoiceEdit from "@/components/contracting/CertificateInvoiceEdit";
import { getPageAccess } from "@/lib/auth";
import { getPurchasePaymentMethods, parseId } from "@/lib/purchase-pages";
import { salePerms } from "@/lib/sale-pages";
import {
  getSaleCategories,
  getSaleCustomers,
} from "@/services/sale-catalog.service";
import { getSaleForEdit } from "@/services/sale.service";
import SaleForm from "@/components/sales/SaleForm";
import { listSalesReps } from "@/services/sales-rep.service";
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

  // فاتورة مقاولات: المستخلص بيتعدل من تعديل المستخلص، والدفعة المقدمة من شاشة العقد
  const ct = await contractingDocOf({ saleId });
  if (ct?.contractId) redirect(`/contracting/${ct.contractId}`);
  if (ct?.certId) {
    if (!can(user, "constructionContracts.editInvoice")) return <NoAccess />;
    if (await isSaleSigned(saleId)) return <ZatcaLocked saleId={saleId} />;
    const [{ methods: payMethods }, units] = await Promise.all([getPurchasePaymentMethods(), getActiveUnits()]);
    return (
      <CertificateInvoiceEdit
        certId={ct.certId}
        backHref={`/invoices/sales/${saleId}`}
        methods={payMethods.filter((m) => m.type !== "credit")}
        units={units}
      />
    );
  }

  const [sale, customers, categories, { methods, creditMethod }] =
    await Promise.all([
      getSaleForEdit(saleId, user),
      getSaleCustomers(user),
      getSaleCategories(),
      getPurchasePaymentMethods(),
    ]);
  if (!sale) notFound();
  // المناديب (وحدة salesReps): مندوب الفاتورة يفضل ظاهر حتى لو اتوقف
  const salesReps = await listSalesReps({
    includeIds: sale.salesRepId ? [sale.salesRepId] : [],
  });
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
      salesReps={salesReps}
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
