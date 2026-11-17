// Server Component: تقرير المشتريات
import { Suspense } from "react";
import { currentFiscalStart } from "@/services/fiscal-year.service";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseReportFilters } from "@/lib/report-pages";
import { getDayStartHour } from "@/lib/business-day-server";
import { getReportOptions, purchasesReport } from "@/services/report.service";
import PurchasesReportView from "@/components/reports/PurchasesReportView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("reports.purchases");
  if (!allowed) return <NoAccess />;
  await connection();
  // "النهارده" = يوم العمل الحالي (بداية يوم العمل في الإعدادات العامة)
  // الفترة الافتراضية: السنة المالية الحالية (من أولها لحد النهارده)
  const filters = parseReportFilters(await searchParams, {
    defaultRange: "fiscal",
    fiscalFrom: await currentFiscalStart(),
    dayStartHour: await getDayStartHour(),
  });
  const [data, options] = await Promise.all([
    purchasesReport(filters, user),
    getReportOptions(user, { parties: ["supplier"] }),
  ]);
  return (
    <PurchasesReportView
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
