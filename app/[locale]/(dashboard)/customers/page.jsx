// Server Component: يجيب العملاء من قاعدة البيانات ويرسلهم جاهزين
import { Suspense } from "react";
import { getPageAccess } from "@/lib/auth";
import NoAccess from "@/components/common/NoAccess";
import { connection } from "next/server";
import { getCustomers, getNextCustomerCode } from "@/services/customer.service";
import PartiesView from "@/components/parties/PartiesView";
import TableSkeleton from "@/components/common/TableSkeleton";

async function CustomersContent() {
  // لازم يكون مسجل دخول ويملك صلاحية "customers.view"
  const { allowed } = await getPageAccess("customers.view");
  if (!allowed) return <NoAccess />;

  await connection();
  // نجيب البيانات والكود التالي في نفس الوقت
  const [parties, nextCode] = await Promise.all([getCustomers(), getNextCustomerCode()]);
  // kind يحدد النوع (عملاء أو موردين): العناوين والـ actions المستخدمة
  return <PartiesView kind="customers" parties={parties} nextCode={nextCode} />;
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <CustomersContent />
    </Suspense>
  );
}
