// Server Component: تقرير العميل (?customer=) - tailoring.reports
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import {
  tailorCustomerReport,
  tailorOrderOptions,
} from "@/services/tailor-order.service";
import TailorCustomerReport from "@/components/tailoring/TailorCustomerReport";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("tailoring.reports");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const customerId = parseId(sp.customer);
  const [options, data] = await Promise.all([
    tailorOrderOptions(),
    customerId ? tailorCustomerReport(customerId, user) : null,
  ]);
  return (
    <TailorCustomerReport
      key={customerId ?? "none"}
      data={data}
      fields={options.fields}
      groups={options.groups}
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
