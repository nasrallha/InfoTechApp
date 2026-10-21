// Server Component: يجيب الموردين من قاعدة البيانات ويرسلهم جاهزين
import { Suspense } from "react";
import { getPageAccess } from "@/lib/auth";
import NoAccess from "@/components/common/NoAccess";
import { connection } from "next/server";
import { getSuppliers, getNextSupplierCode } from "@/services/supplier.service";
import PartiesView from "@/components/parties/PartiesView";
import TableSkeleton from "@/components/common/TableSkeleton";

async function SuppliersContent() {
  // لازم يكون مسجل دخول ويملك صلاحية "suppliers.view"
  const { allowed } = await getPageAccess("suppliers.view");
  if (!allowed) return <NoAccess />;

  await connection();
  // نجيب البيانات والكود التالي في نفس الوقت
  const [parties, nextCode] = await Promise.all([getSuppliers(), getNextSupplierCode()]);
  // kind يحدد النوع (عملاء أو موردين): العناوين والـ actions المستخدمة
  return <PartiesView kind="suppliers" parties={parties} nextCode={nextCode} />;
}

export default function SuppliersPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <SuppliersContent />
    </Suspense>
  );
}
