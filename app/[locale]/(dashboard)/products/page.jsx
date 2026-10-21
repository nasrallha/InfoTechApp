// Server Component: يجيب المنتجات من قاعدة البيانات ويرسلها جاهزة
import { Suspense } from "react";
import { getPageAccess } from "@/lib/auth";
import NoAccess from "@/components/common/NoAccess";
import { connection } from "next/server";
import { getProducts } from "@/services/product.service";
import { getVisibleWarehouses } from "@/services/stock.service";
import ProductsView from "@/components/products/ProductsView";
import TableSkeleton from "@/components/common/TableSkeleton";

async function ProductsContent() {
  // لازم يكون مسجل دخول ويملك صلاحية "products.view"
  const { user, allowed } = await getPageAccess("products.view");
  if (!allowed) return <NoAccess />;

  await connection();
  // الرصيد في الجدول = مجموع المستودعات التي يراها المستخدم
  const warehouses = await getVisibleWarehouses(user);
  const products = await getProducts({
    warehouseIds: warehouses.map((w) => w.id),
  });
  return <ProductsView products={products} />;
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ProductsContent />
    </Suspense>
  );
}
