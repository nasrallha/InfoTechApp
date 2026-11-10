// Server Component: فاتورة بيع جديدة (?quotation=ID ← تحويل عرض سعر لفاتورة، ?export=1 ← فاتورة تصدير)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { getPurchasePaymentMethods, parseId } from "@/lib/purchase-pages";
import { salePerms } from "@/lib/sale-pages";
import {
  getSaleCategories,
  getSaleCustomers,
} from "@/services/sale-catalog.service";
import { getQuotationForForm } from "@/services/quotation.service";
import { getClaimForSale } from "@/services/warranty-claim.service";
import { getFollowUpForSale } from "@/services/follow-up.service";
import { bookingForSale } from "@/services/booking.service";
import { getOpenShift } from "@/services/shift.service";
import SaleForm from "@/components/sales/SaleForm";
import { getActivePromotions } from "@/services/promotion.service";
import { getBranchZatcaInfo } from "@/services/zatca-invoice.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("sales.create");
  if (!allowed) return <NoAccess />;

  await connection();
  const {
    quotation: q,
    export: exp,
    claim: cl,
    followUp: fu,
    booking: bk,
  } = await searchParams;
  // فاتورة من حجز (?booking=ID): الخدمات بمقدم الخدمة + العميل
  const bookingId = parseId(bk);
  // فاتورة صيانة من شاشة المتابعات (?followUp=ID): العميل + تجديد المتابعة
  const followUpId = parseId(fu);
  // فاتورة صيانة من طلب ضمان/صيانة (?claim=ID): قطعه ومصنعيته
  const claimId = parseId(cl);
  // فاتورة تصدير (?export=1)
  const isExport = exp === "1" && !q;
  const quotationId = parseId(q);
  if (quotationId && !can(user, "quotations.convert")) return <NoAccess />;

  const [
    customers,
    categories,
    { methods, creditMethod },
    shift,
    quotation,
    promotions,
    zatca,
    claim,
    followUp,
    booking,
  ] = await Promise.all([
    getSaleCustomers(user),
    getSaleCategories(),
    getPurchasePaymentMethods(),
    getOpenShift(user),
    quotationId ? getQuotationForForm(quotationId, user) : null,
    getActivePromotions(user.branch.id),
    getBranchZatcaInfo(user.branch.id),
    claimId && !quotationId
      ? getClaimForSale(claimId, user).catch(() => null)
      : null,
    followUpId && !quotationId && !claimId
      ? getFollowUpForSale(followUpId, user).catch(() => null)
      : null,
    bookingId && !quotationId && !claimId
      ? bookingForSale(bookingId, user).catch(() => null)
      : null,
  ]);
  if (claimId && !quotationId && !claim) notFound();
  if (quotationId && (!quotation || quotation.status !== "open")) notFound();

  return (
    <SaleForm
      // تحويل عرض سعر ↔ فاتورة جديدة فاضية: شاشة جديدة لكل حالة
      key={
        quotationId ??
        (claimId
          ? `claim-${claimId}`
          : followUp
            ? `followup-${followUp.id}`
            : booking
              ? `booking-${booking.id}`
              : isExport
                ? "export"
                : "new")
      }
      mode="sale"
      customers={customers}
      categories={categories}
      methods={methods}
      creditMethod={creditMethod}
      perms={salePerms(user)}
      promotions={promotions}
      zatca={zatca}
      quotation={quotation}
      claim={claim}
      followUp={followUp}
      booking={booking}
      isExport={isExport}
      shift={shift?.branchId === user.branch.id ? shift : null}
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
