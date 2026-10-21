// Server Component: إعدادات طباعة الفواتير
import { Suspense } from "react";
import { connection } from "next/server";
import { getLocale } from "next-intl/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { getInvoicePrintSettings } from "@/services/invoice-print.service";
import { getCompany } from "@/services/company.service";
import InvoicePrintSettingsForm from "@/components/printing/invoice/InvoicePrintSettingsForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function InvoicePrintContent() {
  // لازم يكون مسجل دخول ويملك صلاحية "printing.view"
  const { user, allowed } = await getPageAccess("printing.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const [settings, company, locale] = await Promise.all([
    getInvoicePrintSettings(),
    getCompany(),
    getLocale(),
  ]);

  return (
    <InvoicePrintSettingsForm
      settings={settings}
      company={company}
      branch={user.branch}
      cashierName={locale === "ar" ? user.arFullname : user.enFullname}
      canEdit={can(user, "printing.update")}
    />
  );
}

export default function InvoicePrintPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <InvoicePrintContent />
    </Suspense>
  );
}
