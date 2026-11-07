// المطعم / المقهى (وحدة restaurant): المنيو والأحجام والإضافات والسائقين والإعدادات
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getRestaurantCatalog } from "@/services/restaurant.service";
import { getOnlineSettings } from "@/services/restaurant-online.service";
import { listPrinters } from "@/services/restaurant-printer.service";
import { listTables } from "@/services/restaurant-table.service";
import { listAgents } from "@/services/print-agent.service";
import { prisma } from "@/lib/prisma";
import { currentCompanyCode, multiTenant } from "@/lib/tenant";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import RestaurantView from "@/components/restaurant/RestaurantView";

const TABS = ["menu", "sizes", "modifiers", "drivers", "tables", "printers", "settings"];

async function Content({ searchParams }) {
  const { allowed } = await getPageAccess("restaurant.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const tab = TABS.includes(sp?.tab) ? sp.tab : "menu";
  const [catalog, online, printers, branches, tables, agents] = await Promise.all([
    getRestaurantCatalog(),
    getOnlineSettings(),
    listPrinters(),
    prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, arName: true, enName: true },
    }),
    listTables(),
    listAgents(),
  ]);
  // لينك الطلب الأونلاين: بكود الشركة (وضع الشركات)
  const orderCode = multiTenant() ? await currentCompanyCode() : "main";
  return (
    <RestaurantView
      key={tab}
      catalog={{ ...catalog, online, orderCode, printers, branches, tables, agents }}
      initialTab={tab}
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
