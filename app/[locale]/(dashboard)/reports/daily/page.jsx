// Server Component: تقرير اليومية (كاش / شبكة / تحويل)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseReportFilters } from "@/lib/report-pages";
import { getDayStartHour } from "@/lib/business-day-server";
import { getReportOptions, dailyReport } from "@/services/report.service";
import DailyReportView from "@/components/reports/DailyReportView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("reports.daily");
  if (!allowed) return <NoAccess />;
  await connection();
  // "النهارده" = يوم العمل الحالي (بداية يوم العمل في الإعدادات العامة)
  const filters = parseReportFilters(await searchParams, {
    dayStartHour: await getDayStartHour(),
  });
  const [data, options] = await Promise.all([
    dailyReport(filters, user),
    getReportOptions(user, { parties: [] }),
  ]);
  return (
    <DailyReportView
      // فلاتر جديدة ← شاشة جديدة (حتى تتحدث قيم الفلاتر)
      key={JSON.stringify(filters)}
      data={data}
      filters={filters}
      options={options}
      showProfit={can(user, "reports.profit")}
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
