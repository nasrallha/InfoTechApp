// Server Component 
// هذا الملف يعمل على السيرفر فقط: يجيب الأقسام من قاعدة البيانات
// ويرسل الصفحة للمتصفح والبيانات فيها جاهزة
import { Suspense } from "react";
import { getPageAccess } from "@/lib/auth";
import NoAccess from "@/components/common/NoAccess";
import { connection } from "next/server";
import { getCategoriesTree } from "@/services/category.service";
import CategoriesView from "@/components/categories/CategoriesView";
import CategoriesSkeleton from "@/components/categories/CategoriesSkeleton";

// المكون الذي يجيب البيانات
async function CategoriesContent() {
  // لازم يكون مسجل دخول ويملك صلاحية "categories.view"
  const { allowed } = await getPageAccess("categories.view");
  if (!allowed) return <NoAccess />;

  // البيانات تتغير باستمرار، فلا نريد أن يحفظها Next وقت البناء (build):
  // connection() تقول له "انتظر طلباً حقيقياً من المستخدم ثم اجلب البيانات"
  await connection();

  // ننادي الـ service مباشرة (بدون action وبدون API) لأننا على السيرفر
  const categories = await getCategoriesTree();

  // نمرر البيانات للجزء التفاعلي (Client Component)
  return <CategoriesView categories={categories} />;
}

export default function CategoriesPage() {
  // Suspense: يعرض شكل التحميل لحظياً لحد ما تصل البيانات
  return (
    <Suspense fallback={<CategoriesSkeleton />}>
      <CategoriesContent />
    </Suspense>
  );
}
