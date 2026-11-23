// Server Component: الطابعات (كل الأنشطة) - إضافة الطابعات وربط وسيط الطباعة
// الكاشير (الإيصالات): شبكة (IP) / ويندوز (USB) / المتصفح، والمطعم كمان طابعات التحضير
// طابعة كل جهاز وفتح الدرج: من «إعدادات الطباعة» على الجهاز نفسه
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { hasModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { listPrinters } from "@/services/restaurant-printer.service";
import { listAgents } from "@/services/print-agent.service";
import { getRestaurantCatalog } from "@/services/restaurant.service";
import PrintersView from "@/components/printing/PrintersView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { allowed } = await getPageAccess("printing.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const restaurant = await hasModule("restaurant");
  const [printers, agents, branches, catalog] = await Promise.all([
    listPrinters(),
    listAgents(),
    prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, arName: true, enName: true },
    }),
    // المطعم: أقسام المنيو وأصنافه (توزيع التحضير على الطابعات)
    restaurant ? getRestaurantCatalog() : null,
  ]);
  return (
    <PrintersView
      printers={printers}
      agents={agents}
      branches={branches}
      categories={catalog?.categories ?? []}
      items={catalog?.items ?? []}
      kitchen={restaurant}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
