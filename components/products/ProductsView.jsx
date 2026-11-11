"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useCan } from "@/components/auth/AuthProvider";
import { useRouter } from "@/i18n/routing";
import PageHeader from "@/components/common/PageHeader";
import { ProductsExport } from "@/components/reports/ListExports";
import ImportButton from "@/components/import/ImportButton";
import ProductTable from "./ProductTable";

// الجزء التفاعلي من صفحة المنتجات
// products: تصل من page.jsx (السيرفر) جاهزة
// warehouses: للمدير لو فيه أكتر من مستودع (عمود «المستودعات» وفلتره)
export default function ProductsView({ products, warehouses = [] }) {
  const router = useRouter();
  // المحدد في الجدول (للتصدير)
  const [selectedIds, setSelectedIds] = useState([]);
  const tSidebar = useTranslations("Sidebar");
  const tButtons = useTranslations("Buttons");
  const can = useCan();

  return (
    <>
      <PageHeader
        extra={
          <div className="flex flex-wrap gap-2">
            <ImportButton kind="products" />
            <ProductsExport products={products} selectedIds={selectedIds} />
          </div>
        }
        title={tSidebar("Products")}
        buttonTitle={can("products.create") ? tButtons("AddNewProduct") : null}
        onButtonClick={() => router.push("/products/addproduct")}
      />
      <ProductTable
        products={products}
        warehouses={warehouses}
        onSelectionChange={setSelectedIds}
      />
    </>
  );
}
