// Server Component: تقرير مبيعات الأصناف (الكميات المباعة والمرتجعة لكل صنف وحركته)
import { Suspense } from "react";
import { currentFiscalStart } from "@/services/fiscal-year.service";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { parseReportFilters } from "@/lib/report-pages";
import { getDayStartHour } from "@/lib/business-day-server";
import { getReportOptions, itemSalesReport } from "@/services/report.service";
import ItemSalesReportView from "@/components/reports/ItemSalesReportView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("reports.itemSales");
  if (!allowed) return <NoAccess />;
  await connection();
  // الفترة الافتراضية: من أول الشهر (يوم العمل)
  const filters = parseReportFilters(await searchParams, {
    defaultRange: "month",
    fiscalFrom: await currentFiscalStart(),
    dayStartHour: await getDayStartHour(),
  });
  const [data, options] = await Promise.all([
    itemSalesReport(filters, user),
    getReportOptions(user, { parties: ["category"] }),
  ]);
  return (
    <ItemSalesReportView
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
