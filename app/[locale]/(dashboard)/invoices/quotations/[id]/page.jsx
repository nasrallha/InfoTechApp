// Server Component: عرض سعر (?print=1 ← يُطبع فور الفتح)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getQuotation } from "@/services/quotation.service";
import { getCompany } from "@/services/company.service";
import { getInvoicePrintSettings } from "@/services/invoice-print.service";
import QuotationDetails from "@/components/sales/QuotationDetails";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import { parsePrintParam } from "@/lib/print-param";

async function Content({ params, searchParams }) {
  const { user, allowed } = await getPageAccess("quotations.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const [{ id }, { print }] = await Promise.all([params, searchParams]);
  const quotationId = parseId(id);
  if (!quotationId) notFound();
  const [quotation, company, printSettings] = await Promise.all([
    getQuotation(quotationId, user),
    getCompany(),
    getInvoicePrintSettings(),
  ]);
  if (!quotation) notFound();

  return (
    <QuotationDetails
      quotation={quotation}
      company={company}
      printSettings={printSettings}
      canCreate={can(user, "quotations.create")}
      canUpdate={can(user, "quotations.update")}
      canDelete={can(user, "quotations.delete")}
      canConvert={can(user, "quotations.convert") && can(user, "sales.create")}
      autoPrint={parsePrintParam(print)}
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
