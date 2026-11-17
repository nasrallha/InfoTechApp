// Server Component: تقرير التبغ (وحدة المطعم): أصناف التبغ ورسوم التبغ
import { Suspense } from "react";
import { currentFiscalStart } from "@/services/fiscal-year.service";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { hasModule } from "@/lib/modules";
import { parseReportFilters } from "@/lib/report-pages";
import { getDayStartHour } from "@/lib/business-day-server";
import { getReportOptions, tobaccoReport } from "@/services/report.service";
import TobaccoReportView from "@/components/reports/TobaccoReportView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("reports.sales");
  if (!allowed || !(await hasModule("restaurant"))) return <NoAccess />;
  await connection();
  // الافتراضي: من أول الشهر (يوم العمل)
  // الفترة الافتراضية: السنة المالية الحالية (من أولها لحد النهارده)
  const filters = parseReportFilters(await searchParams, {
    defaultRange: "fiscal",
    fiscalFrom: await currentFiscalStart(),
    dayStartHour: await getDayStartHour(),
  });
  const [data, options] = await Promise.all([
    tobaccoReport(filters, user),
    getReportOptions(user),
  ]);
  return (
    <TobaccoReportView
      key={JSON.stringify(filters)}
      data={data}
      filters={filters}
      options={options}
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
