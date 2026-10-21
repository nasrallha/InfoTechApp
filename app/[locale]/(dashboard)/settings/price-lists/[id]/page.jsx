// Server Component: أسعار قائمة أسعار
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getPriceList } from "@/services/price-list.service";
import { getPurchaseCategories } from "@/services/purchase.service";
import PriceListPrices from "@/components/settings/price-lists/PriceListPrices";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("priceLists.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const id = parseId((await params).id);
  if (!id) notFound();

  const [priceList, categories] = await Promise.all([
    getPriceList(id),
    getPurchaseCategories(),
  ]);
  if (!priceList) notFound();

  return (
    <PriceListPrices
      priceList={priceList}
      categories={categories}
      canEdit={can(user, "priceLists.update")}
    />
  );
}

export default function Page({ params }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
