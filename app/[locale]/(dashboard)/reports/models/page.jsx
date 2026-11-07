// Server Component: تقرير الموديلات (وحدة المقاسات والألوان)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { hasModule } from "@/lib/modules";
import { parseReportFilters } from "@/lib/report-pages";
import { getDayStartHour } from "@/lib/business-day-server";
import { getReportOptions } from "@/services/report.service";
import { modelsReport } from "@/services/variant.service";
import ModelsReportView from "@/components/reports/ModelsReportView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("reports.sales");
  if (!allowed || !(await hasModule("variants"))) return <NoAccess />;
  await connection();
  // الافتراضي: من أول الشهر (يوم العمل)
  const filters = parseReportFilters(await searchParams, {
    defaultRange: "month",
    dayStartHour: await getDayStartHour(),
  });
  const [data, options] = await Promise.all([
    modelsReport(filters, user),
    getReportOptions(user),
  ]);
  return (
    <ModelsReportView
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
