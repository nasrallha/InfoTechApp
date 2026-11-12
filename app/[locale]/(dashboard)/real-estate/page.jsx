// Server Component: تأجير العقارات - الإعداد (الوحدات والعقارات والملّاك ونماذج العقود)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { getRealEstateSetup } from "@/services/real-estate.service";
import RealEstateView from "@/components/real-estate/RealEstateView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("realEstate.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const data = await getRealEstateSetup(user);
  return (
    <RealEstateView
      data={data}
      tab={sp.tab}
      canManage={can(user, "realEstate.manage")}
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
