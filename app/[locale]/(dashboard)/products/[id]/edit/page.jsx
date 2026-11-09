// Server Component: صفحة تعديل منتج
// الرابط: /products/5/edit ← params.id = "5"
import { Suspense } from "react";
import { getPageAccess } from "@/lib/auth";
import NoAccess from "@/components/common/NoAccess";
import { notFound } from "next/navigation";
import {
  getProductById,
  getProductFormOptions,
  getProductWarehouseOptions,
} from "@/services/product.service";
import ProductForm from "@/components/products/ProductForm";
import TableSkeleton from "@/components/common/TableSkeleton";

async function EditProductContent({ params }) {
  // لازم يكون مسجل دخول ويملك صلاحية "products.update"
  const { user, allowed } = await getPageAccess("products.update");
  if (!allowed) return <NoAccess />;

  // params في Next 16 تصل كـ Promise
  const { id } = await params;
  const productId = Number(id);

  // رقم غير صحيح في الرابط ← صفحة 404
  if (!Number.isInteger(productId) || productId <= 0) notFound();

  // نجيب المنتج والقوائم في نفس الوقت (أسرع من واحد بعد الآخر)
  const [product, { categories, units }, stores] = await Promise.all([
    getProductById(productId),
    getProductFormOptions(),
    getProductWarehouseOptions(user),
  ]);

  if (!product) notFound();

  return (
    <ProductForm
      mode="edit"
      product={product}
      categories={categories}
      units={units}
      stores={stores}
    />
  );
}

export default function EditProductPage({ params }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <EditProductContent params={params} />
    </Suspense>
  );
}
