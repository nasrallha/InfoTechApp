// تفاصيل طلب الضمان / الصيانة (?print=1 ← يطبع إيصال الاستلام على طول)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getClaim } from "@/services/warranty-claim.service";
import { getPurchaseSuppliers } from "@/services/purchase.service";
import { getInvoicePrintSettings } from "@/services/invoice-print.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import ClaimDetails from "@/components/warranty-claims/ClaimDetails";

async function Content({ params, searchParams }) {
  const { user, allowed } = await getPageAccess("warrantyClaims.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  const claimId = parseId(id);
  if (!claimId) notFound();
  const [claim, suppliers, printSettings] = await Promise.all([
    getClaim(claimId, user),
    getPurchaseSuppliers(user),
    getInvoicePrintSettings(),
  ]);
  if (!claim) notFound();
  return (
    <ClaimDetails
      // بعد أي تعديل: البيانات الجديدة (الصفحة بتتحدث)
      key={claim.updatedAt?.toISOString?.() ?? String(claim.updatedAt)}
      claim={claim}
      suppliers={suppliers}
      receiptPaper={printSettings.paperSize === "58mm" ? "58mm" : "80mm"}
      autoPrint={sp?.print === "1"}
    />
  );
}

export default function Page({ params, searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}
