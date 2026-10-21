// Server Component: قوائم الأسعار
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getPriceLists } from "@/services/price-list.service";
import PriceListsView from "@/components/settings/price-lists/PriceListsView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { allowed } = await getPageAccess("priceLists.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const priceLists = await getPriceLists();
  return <PriceListsView priceLists={priceLists} />;
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
