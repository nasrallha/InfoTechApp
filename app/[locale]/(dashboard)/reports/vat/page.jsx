// Server Component: إقرار ضريبة القيمة المضافة (ربع سنوي)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { currentQuarter, parseReportFilters } from "@/lib/report-pages";
import { getReportOptions, vatReport } from "@/services/report.service";
import VatReportView from "@/components/reports/VatReportView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("reports.vat");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  // بدون فترة: الربع الحالي
  const filters = parseReportFilters(
    sp.from || sp.to || sp.year || sp.quarter
      ? sp
      : { ...sp, ...currentQuarter() },
  );
  const [data, options] = await Promise.all([
    vatReport(filters, user),
    getReportOptions(user, { parties: [] }),
  ]);
  return (
    <VatReportView
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
