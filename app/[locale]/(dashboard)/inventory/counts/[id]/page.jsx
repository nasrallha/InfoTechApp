// Server Component: جرد (مسودة للتعديل والترحيل، أو مرحّل للعرض والطباعة)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getCount } from "@/services/inventory.service";
import { getPurchaseCategories } from "@/services/purchase.service";
import { getCompany } from "@/services/company.service";
import CountForm from "@/components/inventory/CountForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("inventoryCounts.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const { id } = await params;
  const countId = parseId(id);
  if (!countId) notFound();

  const [count, categories, company] = await Promise.all([
    getCount(countId, user),
    getPurchaseCategories(),
    getCompany(),
  ]);
  if (!count) notFound();

  return (
    <CountForm
      // بعد الترحيل تتغير الحالة ← نبدأ الشاشة من جديد ببيانات الترحيل
      key={`${count.id}:${count.status}`}
      count={count}
      categories={categories}
      company={company}
      canCreate={can(user, "inventoryCounts.create")}
      canPost={can(user, "inventoryCounts.post")}
      canDelete={can(user, "inventoryCounts.delete")}
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
