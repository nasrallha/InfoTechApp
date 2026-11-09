// Server Component: تعديل تحويل مخزني لسه في الطريق (مش مستلم ولا ملغي)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getVisibleWarehouses } from "@/services/stock.service";
import { getActiveWarehouses } from "@/services/warehouse.service";
import { getPurchaseCategories } from "@/services/purchase.service";
import { getTransferForEdit } from "@/services/inventory.service";
import TransferForm from "@/components/inventory/TransferForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ params }) {
  const { user, allowed } = await getPageAccess("transfers.create");
  if (!allowed) return <NoAccess />;

  await connection();
  const { id } = await params;
  const transferId = parseId(id);
  if (!transferId) notFound();

  const [transfer, visible, active, categories] = await Promise.all([
    getTransferForEdit(transferId, user),
    getVisibleWarehouses(user),
    getActiveWarehouses(),
    getPurchaseCategories(),
  ]);
  // مش موجود، أو اتستلم / اتلغى، أو مش من مستودع المستخدم
  if (!transfer) notFound();

  return (
    <TransferForm
      transfer={transfer}
      fromWarehouses={visible.filter((w) => w.isActive)}
      toWarehouses={active}
      categories={categories}
      canChangeDate={can(user, "transfers.changeDate")}
    />
  );
}

export default function Page({ params }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
