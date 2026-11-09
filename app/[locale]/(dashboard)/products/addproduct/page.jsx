// Server Component: يجيب الأقسام والوحدات لقوائم الاختيار، ثم يعرض فورم الإضافة
import { Suspense } from "react";
import { getPageAccess } from "@/lib/auth";
import NoAccess from "@/components/common/NoAccess";
import { connection } from "next/server";
import {
  getProductFormOptions,
  getProductWarehouseOptions,
} from "@/services/product.service";
import { getSystemSettings } from "@/services/system-settings.service";
import ProductForm from "@/components/products/ProductForm";
import TableSkeleton from "@/components/common/TableSkeleton";

async function AddProductContent() {
  // لازم يكون مسجل دخول ويملك صلاحية "products.create"
  const { user, allowed } = await getPageAccess("products.create");
  if (!allowed) return <NoAccess />;

  await connection();
  const [{ categories, units }, settings, stores] = await Promise.all([
    getProductFormOptions(),
    getSystemSettings(),
    getProductWarehouseOptions(user),
  ]);

  // الصنف الجديد يأخذ نسبة الضريبة ووضع السعر من الإعدادات العامة
  const defaults = {
    taxRate: settings.taxRate,
    priceIncludesTax: settings.productPriceIncludesTax,
  };

  return (
    <ProductForm
      mode="add"
      categories={categories}
      units={units}
      defaults={defaults}
      stores={stores}
    />
  );
}

export default function AddProductPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <AddProductContent />
    </Suspense>
  );
}
