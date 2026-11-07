// Server Component: عرض مستند تالف / زيادة (طباعة / إلغاء)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getAdjustment } from "@/services/stock-adjustment.service";
import { getCompany } from "@/services/company.service";
import AdjustmentDetails from "@/components/inventory/AdjustmentDetails";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("stockAdjustments.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const { id } = await params;
  const adjustmentId = parseId(id);
  if (!adjustmentId) notFound();

  const [adjustment, company] = await Promise.all([
    getAdjustment(adjustmentId, user),
    getCompany(),
  ]);
  if (!adjustment) notFound();

  return (
    <AdjustmentDetails
      adjustment={adjustment}
      company={company}
      canCancel={can(user, "stockAdjustments.cancel")}
      canEdit={can(user, "stockAdjustments.update")}
      canCreate={can(user, "stockAdjustments.create")}
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
