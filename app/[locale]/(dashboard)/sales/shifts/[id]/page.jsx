// Server Component: وردية (الملخص، القفل، طباعة التقرير) — ?print=1 يطبع فور الفتح
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getShift } from "@/services/shift.service";
import { getCompany } from "@/services/company.service";
import { getInvoicePrintSettings } from "@/services/invoice-print.service";
import { ShiftDetails } from "@/components/sales/ShiftsView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params, searchParams }) {
  const { user } = await getPageAccess();
  if (!user || (!can(user, "shifts.view") && !can(user, "sales.pos"))) {
    return <NoAccess />;
  }
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const shiftId = parseId(id);
  if (!shiftId) notFound();
  const [shift, company, printSettings] = await Promise.all([
    getShift(shiftId, user),
    getCompany(),
    getInvoicePrintSettings(),
  ]);
  if (!shift) notFound();
  return (
    <ShiftDetails
      shift={shift}
      company={company}
      printSettings={printSettings}
      autoPrint={sp?.print === "1" && !shift.blind}
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
