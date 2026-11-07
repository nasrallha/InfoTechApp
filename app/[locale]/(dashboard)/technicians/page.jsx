// الفنيون (وحدة technicians)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getTechnicians } from "@/services/technician.service";
import { prisma } from "@/lib/prisma";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import TechniciansView from "@/components/technicians/TechniciansView";

async function Content() {
  const { allowed } = await getPageAccess("technicians.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const [technicians, categories] = await Promise.all([
    getTechnicians(),
    // الأقسام لاستثناءات العمولة
    prisma.category.findMany({
      orderBy: { id: "asc" },
      select: { id: true, arName: true, enName: true, parentId: true },
    }),
  ]);
  return <TechniciansView technicians={technicians} categories={categories} />;
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
