// Server Component: تقارير تأجير العقارات
// ?tab=units|dues|invoices|expiring|owner|tenant&from=&to=&owner=&property=&status=&customer=
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { isDay, today } from "@/lib/dates";
import { parseId } from "@/lib/purchase-pages";
import { addDays, addMonths } from "@/lib/rent";
import {
  duesReport,
  expiringReport,
  invoicesReport,
  ownerStatement,
  rentReportOptions,
  tenantReport,
  unitsReport,
} from "@/services/rent-report.service";
import { can } from "@/lib/permissions";
import { getActivePaymentMethods } from "@/services/payment-method.service";
import RentReportsView from "@/components/real-estate/RentReportsView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

const TABS = ["units", "dues", "invoices", "expiring", "owner", "tenant"];
const LOADERS = {
  units: unitsReport,
  dues: duesReport,
  invoices: invoicesReport,
  expiring: expiringReport,
  owner: ownerStatement,
  tenant: tenantReport,
};

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("realEstate.reports");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const tab = TABS.includes(sp.tab) ? sp.tab : "dues";
  const now = today();
  // الفترة الافتراضية: الشهر الحالي (والعقود المنتهية: من النهارده لـ 30 يوم)
  const monthStart = `${now.slice(0, 7)}-01`;
  const defFrom = tab === "expiring" ? now : monthStart;
  const defTo =
    tab === "expiring" ? addDays(now, 30) : addDays(addMonths(monthStart, 1), -1);
  const filters = {
    from: isDay(sp.from) ? sp.from : defFrom,
    to: isDay(sp.to) ? sp.to : defTo,
    ownerId: parseId(sp.owner),
    propertyId: parseId(sp.property),
    // تقرير المستأجر
    customerId: parseId(sp.customer),
    status: String(sp.status ?? "") || (tab === "units" ? "all" : tab === "dues" ? "due" : ""),
  };
  const canInvoice = can(user, "rentContracts.invoice");
  const [data, options, methods] = await Promise.all([
    LOADERS[tab](filters, user),
    rentReportOptions(user),
    // الاستحقاقات: إصدار الفاتورة من التقرير (طرق الدفع من غير «آجل»)
    tab === "dues" && canInvoice ? getActivePaymentMethods() : [],
  ]);
  return (
    <RentReportsView
      // فلاتر جديدة ← شاشة جديدة (قيم الفلاتر تتحدث)
      key={JSON.stringify({ tab, ...filters })}
      tab={tab}
      data={data}
      filters={filters}
      options={options}
      canInvoice={canInvoice}
      paymentMethods={methods.filter((m) => m.type !== "credit")}
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
