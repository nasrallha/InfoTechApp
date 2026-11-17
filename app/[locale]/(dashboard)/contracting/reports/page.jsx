// Server Component: تقارير المقاولات (?tab=summary|position|retentions&kind=owner|sub&status=&year=&q=)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { contractingReport } from "@/services/contracting-report.service";
import ContractingReports from "@/components/contracting/ContractingReports";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

const TABS = ["summary", "position", "retentions"];
const STATUSES = ["active", "completed", "all"];

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("contracting.reports");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const filters = {
    tab: TABS.includes(sp.tab) ? sp.tab : "summary",
    kind: sp.kind === "sub" ? "sub" : "owner",
    status: STATUSES.includes(sp.status) ? sp.status : "active",
    // ملخص المشاريع: السنة + البحث
    year: /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : null,
    q: String(sp.q ?? "").slice(0, 100),
  };
  const data = await contractingReport(filters, user);
  return <ContractingReports data={data} filters={filters} />;
}

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
