// Server Component: يجيب العملاء من قاعدة البيانات ويرسلهم جاهزين
import { Suspense } from "react";
import { getPageAccess } from "@/lib/auth";
import NoAccess from "@/components/common/NoAccess";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getBranches } from "@/services/branch.service";
import { getCustomers, getNextCustomerCode } from "@/services/customer.service";
import PartiesView from "@/components/parties/PartiesView";
import TableSkeleton from "@/components/common/TableSkeleton";

async function CustomersContent() {
  // لازم يكون مسجل دخول ويملك صلاحية "customers.view"
  const { user, allowed } = await getPageAccess("customers.view");
  if (!allowed) return <NoAccess />;

  await connection();
  // نجيب البيانات والكود التالي في نفس الوقت
  // صاحب "عرض كل الفروع": بيحدد إتاحة الطرف في الفروع
  const [parties, nextCode, branches] = await Promise.all([
    getCustomers(user),
    getNextCustomerCode(),
    can(user, "allBranches.view") ? getBranches() : null,
  ]);
  // kind يحدد النوع (عملاء أو موردين): العناوين والـ actions المستخدمة
  return (
    <PartiesView
      kind="customers"
      parties={parties}
      nextCode={nextCode}
      branches={branches}
    />
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <CustomersContent />
    </Suspense>
  );
}
