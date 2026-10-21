// Server Component: صفحة العملات (الإعدادات)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getCurrencies } from "@/services/currency.service";
import CurrenciesView from "@/components/settings/currencies/CurrenciesView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function CurrenciesContent() {
  const { allowed } = await getPageAccess("currencies.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const currencies = await getCurrencies();
  return <CurrenciesView currencies={currencies} />;
}

export default function CurrenciesPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <CurrenciesContent />
    </Suspense>
  );
}
