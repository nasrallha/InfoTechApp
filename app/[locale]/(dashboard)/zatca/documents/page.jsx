// Server Component: متابعة الفواتير الإلكترونية (وتقرير الفواتير المرفوعة للزكاة)
import { Suspense } from "react";
import { currentFiscalStart } from "@/services/fiscal-year.service";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { listZatcaDocuments } from "@/services/zatca-invoice.service";
import ZatcaDocumentsView from "@/components/zatca/ZatcaDocumentsView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("zatca.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const now = today();
  const filters = {
    // الافتراضي: من أول السنة المالية الحالية
    from: sp.from || (await currentFiscalStart()),
    to: sp.to || now,
    status: sp.status || null,
    kind: null,
    docType: null,
    branchId: null,
  };
  const allBranches = can(user, "allBranches.view");
  const [data, branches] = await Promise.all([
    listZatcaDocuments(filters, user),
    allBranches
      ? prisma.branch.findMany({
          orderBy: { id: "asc" },
          select: { id: true, arName: true, enName: true },
        })
      : [],
  ]);
  return (
    <ZatcaDocumentsView
      initialFilters={filters}
      initialData={data}
      branches={branches}
      canSend={can(user, "zatca.send")}
      canExport={can(user, "zatca.export")}
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
