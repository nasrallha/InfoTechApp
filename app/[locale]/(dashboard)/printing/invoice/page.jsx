// Server Component: إعدادات طباعة الفواتير
import { Suspense } from "react";
import { connection } from "next/server";
import { getLocale } from "next-intl/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import {
  getDeviceInvoiceSettings,
  getDevicePrintConfig,
  getInvoicePrintSettings,
} from "@/services/invoice-print.service";
import { branchPrinters } from "@/services/restaurant-printer.service";
import { getCompany } from "@/services/company.service";
import InvoicePrintSettingsForm from "@/components/printing/invoice/InvoicePrintSettingsForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function InvoicePrintContent() {
  // لازم يكون مسجل دخول ويملك صلاحية "printing.view"
  const { user, allowed } = await getPageAccess("printing.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const [settings, deviceSettings, company, locale, devicePrint, printers] = await Promise.all([
    // الإعدادات الافتراضية (الشركة) + إعدادات الجهاز ده (لو ليه)
    getInvoicePrintSettings({ device: false }),
    getDeviceInvoiceSettings(),
    getCompany(),
    getLocale(),
    // طابعة الإيصالات وفتح الدرج على الجهاز ده + طابعات الفرع
    getDevicePrintConfig(user),
    branchPrinters(user.branch.id),
  ]);

  return (
    <InvoicePrintSettingsForm
      settings={settings}
      deviceSettings={deviceSettings}
      devicePrint={devicePrint}
      printers={printers.map((p) => ({
        id: p.id,
        name: p.name,
        connection: p.connection,
        paperSize: p.paperSize,
      }))}
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
