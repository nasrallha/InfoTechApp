// Server Component: تقرير الأرباح
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseReportFilters } from "@/lib/report-pages";
import { getReportOptions, profitReport } from "@/services/report.service";
import ProfitReportView from "@/components/reports/ProfitReportView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("reports.profit");
  if (!allowed) return <NoAccess />;
  await connection();
  const filters = parseReportFilters(await searchParams);
  const [data, options] = await Promise.all([
    profitReport(filters, user),
    getReportOptions(user, { parties: [] }),
  ]);
  return (
    <ProfitReportView
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
