// Server Component: صفحة بيانات الشركة (الإعدادات)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { getCompany } from "@/services/company.service";
import CompanyForm from "@/components/settings/CompanyForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function CompanyContent() {
  // لازم يكون مسجل دخول ويملك صلاحية "company.view"
  const { user, allowed } = await getPageAccess("company.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const company = await getCompany();

  // بدون صلاحية التعديل: الفورم يظهر للقراءة فقط
  return <CompanyForm company={company} canEdit={can(user, "company.update")} />;
}

export default function CompanyPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <CompanyContent />
    </Suspense>
  );
}
