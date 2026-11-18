// Server Component: تقرير المبيعات
import { Suspense } from "react";
import { currentFiscalStart } from "@/services/fiscal-year.service";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseReportFilters } from "@/lib/report-pages";
import { getDayStartHour } from "@/lib/business-day-server";
import { getReportOptions, salesReport } from "@/services/report.service";
import SalesReportView from "@/components/reports/SalesReportView";
import { listSalesReps } from "@/services/sales-rep.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("reports.sales");
  if (!allowed) return <NoAccess />;
  await connection();
  // "النهارده" = يوم العمل الحالي (بداية يوم العمل في الإعدادات العامة)
  // الفترة الافتراضية: السنة المالية الحالية (من أولها لحد النهارده)
  const filters = parseReportFilters(await searchParams, {
    defaultRange: "fiscal",
    fiscalFrom: await currentFiscalStart(),
    dayStartHour: await getDayStartHour(),
  });
  const [data, options, reps] = await Promise.all([
    salesReport(filters, user),
    getReportOptions(user, { parties: ["customer", "category"] }),
    // المناديب (وحدة salesReps) - فاضية لو الوحدة مقفولة
    listSalesReps({ includeIds: filters.salesRepId ? [filters.salesRepId] : [] }),
  ]);
  return (
    <SalesReportView
      // فلاتر جديدة ← شاشة جديدة (حتى تتحدث قيم الفلاتر)
      key={JSON.stringify(filters)}
      data={data}
      filters={filters}
      options={{ ...options, reps }}
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
