// Server Component: يجيب المنتجات من قاعدة البيانات ويرسلها جاهزة
import { Suspense } from "react";
import { getPageAccess } from "@/lib/auth";
import NoAccess from "@/components/common/NoAccess";
import { connection } from "next/server";
import { getProducts } from "@/services/product.service";
import {
  getVisibleWarehouses,
  userWarehouseId,
} from "@/services/stock.service";
import { can } from "@/lib/permissions";
import ProductsView from "@/components/products/ProductsView";
import TableSkeleton from "@/components/common/TableSkeleton";

async function ProductsContent() {
  // لازم يكون مسجل دخول ويملك صلاحية "products.view"
  const { user, allowed } = await getPageAccess("products.view");
  if (!allowed) return <NoAccess />;

  await connection();
  // الرصيد في الجدول = مجموع المستودعات التي يراها المستخدم
  const warehouses = await getVisibleWarehouses(user);
  // موظف الفرع: أصناف مستودع فرعه بس | المدير: الكل + فلتر بالمستودع
  const all = can(user, "allBranches.view");
  const products = await getProducts({
    warehouseIds: warehouses.map((w) => w.id),
    onlyWarehouseId: all ? null : await userWarehouseId(user),
  });
  return (
    <ProductsView
      products={products}
      warehouses={all && warehouses.length > 1 ? warehouses : []}
    />
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ProductsContent />
    </Suspense>
  );
}
