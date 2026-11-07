// طلبات الضمان والصيانة (وحدة warrantyClaims)
import { Suspense } from "react";
import { getPageAccess } from "@/lib/auth";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import ClaimsListView from "@/components/warranty-claims/ClaimsListView";

async function Content() {
  const { allowed } = await getPageAccess("warrantyClaims.view");
  if (!allowed) return <NoAccess />;
  return <ClaimsListView />;
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
