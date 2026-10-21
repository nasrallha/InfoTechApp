// Server Component: العروض والخصومات لفترة
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import {
  getPromotionOptions,
  listPromotions,
} from "@/services/promotion.service";
import PromotionsView from "@/components/promotions/PromotionsView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { allowed } = await getPageAccess("promotions.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const [promotions, options] = await Promise.all([
    listPromotions(),
    getPromotionOptions(),
  ]);
  return <PromotionsView promotions={promotions} options={options} />;
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
