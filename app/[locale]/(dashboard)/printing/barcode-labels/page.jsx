// Server Component: إعدادات ملصقات الباركود (الطباعة)
import { Suspense } from "react";
import { connection } from "next/server";
import { getLocale } from "next-intl/server";
import { getPageAccess } from "@/lib/auth";
import { getBarcodeLabels } from "@/services/barcode-label.service";
import { getCompany } from "@/services/company.service";
import BarcodeLabelsView from "@/components/printing/BarcodeLabelsView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function BarcodeLabelsContent() {
  // لازم يكون مسجل دخول ويملك صلاحية "printing.view"
  const { allowed } = await getPageAccess("printing.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const [labels, company, locale] = await Promise.all([
    getBarcodeLabels(),
    getCompany(),
    getLocale(),
  ]);

  // اسم الشركة يظهر على الملصق لو القالب مفعّل فيه "اسم الشركة"
  const companyName = company ? (locale === "ar" ? company.arName : company.enName) : null;

  return <BarcodeLabelsView labels={labels} companyName={companyName} />;
}

export default function BarcodeLabelsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <BarcodeLabelsContent />
    </Suspense>
  );
}
