// المغسلة (وحدة laundry): لوحة الطلبات + ملخص اليوم
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getInvoicePrintSettings } from "@/services/invoice-print.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import LaundryOrdersView from "@/components/laundry/LaundryOrdersView";

async function Content({ searchParams }) {
  const { allowed } = await getPageAccess("laundryOrders.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const q = typeof sp?.q === "string" ? sp.q.slice(0, 50) : "";
  const printSettings = await getInvoicePrintSettings();
  return (
    <LaundryOrdersView
      key={q}
      initialQ={q}
      printSettings={{
        // الإيصال حراري بس (مفيش A4 في المغسلة)
        paperSize: printSettings.paperSize === "58mm" ? "58mm" : "80mm",
        language: printSettings.language,
      }}
      // الفاتورة كاملة (PDF على واتساب)
      invoiceSettings={{
        ...printSettings,
        paperSize: printSettings.paperSize === "58mm" ? "58mm" : "80mm",
      }}
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
