// Server Component: الإدارة ← تعديل جماعي للأصناف (لمالك البرنامج)
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/services/system-settings.service";
import { getVisibleWarehouses } from "@/services/stock.service";
import ProductsBulkView from "@/components/admin/ProductsBulkView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { user, allowed } = await getPageAccess("productsBulk.run");
  if (!allowed) return <NoAccess />;
  await connection();
  const [categories, settings, warehouses] = await Promise.all([
    prisma.category.findMany({
      orderBy: { id: "asc" },
      select: { id: true, arName: true, enName: true },
    }),
    getSystemSettings(),
    getVisibleWarehouses(user),
  ]);
  return (
    <ProductsBulkView
      categories={categories}
      defaultTaxRate={Number(settings.taxRate ?? 15)}
      warehouses={warehouses
        .filter((w) => w.isActive !== false)
        .map((w) => ({
          id: w.id,
          arName: w.arName,
          enName: w.enName,
          isMain: w.isMain,
        }))}
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
