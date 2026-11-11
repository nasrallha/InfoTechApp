// Server Component: تقرير الصلاحية والدفعات (ميزة expiry)
// ?warehouse=&status=all|near|expired&days=&q=&from=&to= (من/إلى = تاريخ الانتهاء)
import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getPageAccess } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { autoDisposeExpired } from "@/services/stock-adjustment.service";
import { prisma } from "@/lib/prisma";
import { parseId } from "@/lib/purchase-pages";
import { getVisibleWarehouses } from "@/services/stock.service";
import { listBatches } from "@/services/batch.service";
import BatchesView from "@/components/batches/BatchesView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

const STATUSES = ["all", "near", "expired"];
// تاريخ بصيغة YYYY-MM-DD أو null
const dayParam = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? v : null);

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("batches.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const sp = await searchParams;
  // إعداد "إتلاف المنتهي تلقائياً": المنتهي في مستودعات المستخدم يتعمله تالف قبل العرض
  if (can(user, "stockAdjustments.add")) {
    const t = await getTranslations("BatchesReport");
    await autoDisposeExpired(user, t("AutoDisposeReason")).catch(() => null);
  }
  const warehouses = await getVisibleWarehouses(user);
  const ids = warehouses.map((w) => w.id);
  const wid = parseId(sp.warehouse);
  const status = STATUSES.includes(sp.status) ? sp.status : "all";
  const days = Number(sp.days) > 0 ? Math.min(Number(sp.days), 3650) : null;
  const q = String(sp.q ?? "").slice(0, 100);
  const from = dayParam(sp.from);
  const to = dayParam(sp.to);
  const data = await listBatches(
    {
      warehouseId: wid && ids.includes(wid) ? wid : null,
      status,
      days,
      q,
      from,
      to,
    },
    ids,
    prisma,
  );
  return (
    <BatchesView
      data={data}
      warehouses={warehouses}
      filters={{ warehouseId: wid, status, days, q, from, to }}
      canDispose={can(user, "batches.dispose")}
      canPrint={can(user, "barcodes.print")}
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
