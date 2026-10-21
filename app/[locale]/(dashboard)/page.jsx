// Server Component: الصفحة الرئيسية (لوحة المتابعة)
// الأرقام المالية والرسوم لمن يملك صلاحية "dashboard.finance" فقط
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { dashboardData } from "@/services/dashboard.service";
import Dashboard from "@/components/dashboard/Dashboard";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { user } = await getPageAccess();
  await connection();
  const data = await dashboardData(user);
  return <Dashboard data={data} />;
}

export default function Home() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
