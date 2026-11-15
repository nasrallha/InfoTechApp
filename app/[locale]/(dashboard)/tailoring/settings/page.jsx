// Server Component: إعدادات الخياط (التفاصيل بالصور + خانات المقاسات + سعر التفصيل)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { getTailoringSetup } from "@/services/tailoring.service";
import TailorSettingsView from "@/components/tailoring/TailorSettingsView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("tailoring.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const data = await getTailoringSetup();
  return (
    <TailorSettingsView
      data={data}
      tab={sp.tab}
      canManage={can(user, "tailoring.manage")}
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
