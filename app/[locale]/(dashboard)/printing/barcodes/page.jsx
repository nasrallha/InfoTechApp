// Server Component: شاشة طباعة الباركود
// /printing/barcodes            ← تفتح فاضية
// /printing/barcodes?ids=3,7,9  ← تفتح ومعها المنتجات (من جدول المنتجات)
import { Suspense } from "react";
import { connection } from "next/server";
import { getLocale } from "next-intl/server";
import { getPageAccess } from "@/lib/auth";
import { getActiveBarcodeLabels } from "@/services/barcode-label.service";
import {
  getLabelBatchesByIds,
  getLabelProductsByIds,
} from "@/services/barcode-print.service";
import { getVisibleWarehouses } from "@/services/stock.service";
import { getCompany } from "@/services/company.service";
import BarcodePrintView from "@/components/printing/BarcodePrintView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

// "3,7,9" ← [3, 7, 9] (نتجاهل أي قيمة غير صحيحة، وبحد أقصى 200 منتج)
const parseIds = (value) =>
  [...new Set(String(value ?? "").split(","))]
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 200);

async function BarcodePrintContent({ searchParams }) {
  // لازم يكون مسجل دخول ويملك صلاحية "barcodes.print"
  const { user, allowed } = await getPageAccess("barcodes.print");
  if (!allowed) return <NoAccess />;

  await connection();
  // batches: ملصقات دفعات (تتبع الصلاحية) من تقرير الصلاحية
  const { ids, batches } = await searchParams;
  const batchIds = parseIds(batches);

  const [labels, products, batchProducts, company, locale] = await Promise.all([
    getActiveBarcodeLabels(),
    getLabelProductsByIds(parseIds(ids)),
    batchIds.length
      ? getVisibleWarehouses(user).then((ws) =>
          getLabelBatchesByIds(
            batchIds,
            ws.map((w) => w.id),
          ),
        )
      : [],
    getCompany(),
    getLocale(),
  ]);

  const companyName = company ? (locale === "ar" ? company.arName : company.enName) : null;

  return (
    <BarcodePrintView
      labels={labels}
      initialProducts={[...products, ...batchProducts]}
      companyName={companyName}
    />
  );
}

export default function BarcodePrintPage({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <BarcodePrintContent searchParams={searchParams} />
    </Suspense>
  );
}
