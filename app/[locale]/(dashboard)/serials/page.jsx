// البحث بالرقم التسلسلي (وحدة serials)
// الرابط: /serials?q=123 ← يبحث على طول
import { Suspense } from "react";
import { getPageAccess } from "@/lib/auth";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import SerialSearchView from "@/components/serials/SerialSearchView";
import { connection } from "next/server";
import { getInvoicePrintSettings } from "@/services/invoice-print.service";

async function Content({ searchParams }) {
  const { allowed } = await getPageAccess("serials.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const q = typeof sp?.q === "string" ? sp.q.slice(0, 100) : "";
  // ورق الكاشير لشهادة الضمان (لو الفواتير A4: 80mm)
  const { paperSize } = await getInvoicePrintSettings();
  return (
    <SerialSearchView
      initialQuery={q}
      receiptPaper={paperSize === "58mm" ? "58mm" : "80mm"}
    />
  );
}

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
