// المتابعات الدورية (وحدة followUps) - ?focus=ID من الإشعار
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import FollowUpsView from "@/components/follow-ups/FollowUpsView";

async function Content({ searchParams }) {
  const { allowed } = await getPageAccess("followUps.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const { focus } = await searchParams;
  const focusId = parseId(focus);
  return <FollowUpsView key={focusId ?? "all"} focusId={focusId} />;
}

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
