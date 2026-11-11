// Server Component: تعديل مستند تالف / زيادة
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getVisibleWarehouses } from "@/services/stock.service";
import {
  getPurchaseCategories,
  pickerProductsByIds,
} from "@/services/purchase.service";
import { getAdjustment } from "@/services/stock-adjustment.service";
import AdjustmentForm from "@/components/inventory/AdjustmentForm";
import { prisma } from "@/lib/prisma";
import { docBatches } from "@/services/batch.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("stockAdjustments.update");
  if (!allowed) return <NoAccess />;

  await connection();
  const { id } = await params;
  const adjustmentId = parseId(id);
  if (!adjustmentId) notFound();
  const adjustment = await getAdjustment(adjustmentId, user);
  if (!adjustment || adjustment.status !== "posted") notFound();

  const [visible, categories, products, batches] = await Promise.all([
    getVisibleWarehouses(user),
    getPurchaseCategories(),
    pickerProductsByIds(adjustment.items.map((i) => i.productId)),
    // تتبع الصلاحية: دفعات المستند (الزيادة: اللي دخل / التالف: اللي خرج)
    docBatches(
      prisma,
      "adjustment",
      adjustment.id,
      adjustment.type === "surplus" ? 1 : -1,
    ),
  ]);

  return (
    <AdjustmentForm
      key={`${adjustment.id}-${adjustment.updatedAt ?? ""}`}
      adjustment={adjustment}
      products={products}
      docBatches={batches}
      warehouses={visible.filter(
        (w) => w.isActive || w.id === adjustment.warehouse.id,
      )}
      categories={categories}
      canChangeDate={can(user, "stockAdjustments.changeDate")}
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
