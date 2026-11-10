import "server-only";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getPurchase } from "@/services/purchase.service";
import { getCompany } from "@/services/company.service";
import { getInvoicePrintSettings } from "@/services/invoice-print.service";
import PurchaseDetails from "@/components/purchases/PurchaseDetails";
import NoAccess from "@/components/common/NoAccess";
import { parsePrintParam } from "@/lib/print-param";

// محتوى صفحة عرض فاتورة شراء أو مرتجع (نفس الشاشة للنوعين)
// type: "purchase" / "return"
export async function PurchaseViewContent({ type, params, searchParams }) {
  const isReturn = type === "return";
  const { user, allowed } = await getPageAccess(
    isReturn ? "purchaseReturns.view" : "purchases.view",
  );
  if (!allowed) return <NoAccess />;

  await connection();
  const [{ id }, { print }] = await Promise.all([params, searchParams]);
  const purchaseId = parseId(id);
  if (!purchaseId) notFound();

  const [purchase, company, printSettings] = await Promise.all([
    getPurchase(purchaseId, type, user),
    getCompany(),
    getInvoicePrintSettings(),
  ]);
  if (!purchase) notFound();

  return (
    <PurchaseDetails
      purchase={purchase}
      company={company}
      printSettings={printSettings}
      canCreate={can(
        user,
        isReturn ? "purchaseReturns.create" : "purchases.create",
      )}
      canReturn={can(user, "purchaseReturns.create")}
      canNote={!isReturn && can(user, "purchaseNotes.create")}
      canUpdate={!isReturn && can(user, "purchases.update")}
      canDelete={can(
        user,
        isReturn ? "purchaseReturns.delete" : "purchases.delete",
      )}
      autoPrint={parsePrintParam(print)}
    />
  );
}
