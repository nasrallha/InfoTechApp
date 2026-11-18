// Server Component: وردية الفرع (الأدراج، الملخص المجمّع، القفل اليدوي، الطباعة)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getBranchShift } from "@/services/shift.service";
import { getCompany } from "@/services/company.service";
import { getInvoicePrintSettings } from "@/services/invoice-print.service";
import { BranchShiftDetails } from "@/components/sales/BranchShiftsView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user } = await getPageAccess();
  if (!user || (!can(user, "shifts.view") && !can(user, "sales.pos"))) {
    return <NoAccess />;
  }
  await connection();
  const { id } = await params;
  const bsId = parseId(id);
  if (!bsId) notFound();
  const [bs, company, printSettings] = await Promise.all([
    getBranchShift(bsId, user),
    getCompany(),
    getInvoicePrintSettings(),
  ]);
  if (!bs) notFound();
  return <BranchShiftDetails bs={bs} company={company} printSettings={printSettings} />;
}

export default function Page({ params }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
