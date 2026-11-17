// Server Component: المستخلصات (تقرير عام: عقود المالك ومقاولي الباطن والسريعة)
// ?q= بحث | ?from= ?to= الفترة | ?kind= all|owner|sub|quick | ?page=
import { Suspense } from "react";
import { currentFiscalStart } from "@/services/fiscal-year.service";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parsePage } from "@/lib/purchase-pages";
import { listCertificates } from "@/services/contract-certificate.service";
import { getActivePaymentMethods } from "@/services/payment-method.service";
import { getActiveUnits } from "@/services/unit.service";
import CertificatesList from "@/components/contracting/CertificatesList";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ["all", "owner", "sub", "quick"];

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("constructionContracts.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const filters = {
    q: String(sp.q ?? "").slice(0, 100),
    // الافتراضي: من أول السنة المالية الحالية
    from: DAY_RE.test(sp.from ?? "") ? sp.from : await currentFiscalStart(),
    to: DAY_RE.test(sp.to ?? "") ? sp.to : null,
    kind: KINDS.includes(sp.kind) ? sp.kind : "all",
  };
  const [data, methods, units] = await Promise.all([
    listCertificates({ ...filters, page: parsePage(sp.page) }, user),
    getActivePaymentMethods(),
    getActiveUnits(),
  ]);
  return (
    <CertificatesList
      data={data}
      filters={filters}
      // الإفراج عن الضمان بسند (من غير «آجل»)
      paymentMethods={methods.filter((m) => m.type !== "credit")}
      units={units}
      perms={{
        invoice: can(user, "constructionContracts.invoice"),
        editInvoice: can(user, "constructionContracts.editInvoice"),
        cancelInvoice: can(user, "constructionContracts.cancelInvoice"),
        payments: can(user, "constructionContracts.payments"),
      }}
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
