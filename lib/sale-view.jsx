import "server-only";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId } from "@/lib/purchase-pages";
import { getSale } from "@/services/sale.service";
import { getCompany } from "@/services/company.service";
import { getInvoicePrintSettings } from "@/services/invoice-print.service";
import {
  getBranchZatcaInfo,
  isProductionLive,
} from "@/services/zatca-invoice.service";
import SaleDetails from "@/components/sales/SaleDetails";
import NoAccess from "@/components/common/NoAccess";
import { parsePrintParam } from "@/lib/print-param";

// محتوى صفحة عرض فاتورة بيع أو مرتجع (نفس الشاشة للنوعين)
// type: "sale" / "return"
export async function SaleViewContent({ type, params, searchParams }) {
  const isReturn = type === "return";
  const { user, allowed } = await getPageAccess(
    isReturn ? "salesReturns.view" : "sales.view",
  );
  if (!allowed) return <NoAccess />;

  await connection();
  const [{ id }, { print }] = await Promise.all([params, searchParams]);
  const saleId = parseId(id);
  if (!saleId) notFound();

  const [sale, company, printSettings] = await Promise.all([
    getSale(saleId, type, user),
    getCompany(),
    getInvoicePrintSettings(),
  ]);
  if (!sale) notFound();
  const [zatca, productionLive] = await Promise.all([
    getBranchZatcaInfo(sale.branch.id),
    isProductionLive(),
  ]);

  return (
    <SaleDetails
      sale={sale}
      company={company}
      printSettings={printSettings}
      canCreate={can(user, isReturn ? "salesReturns.create" : "sales.create")}
      canReturn={can(user, "salesReturns.create")}
      canNote={!isReturn && can(user, "salesNotes.create")}
      canUpdate={!isReturn && can(user, "sales.update")}
      canDelete={can(user, isReturn ? "salesReturns.delete" : "sales.delete")}
      productionLive={productionLive}
      autoPrint={parsePrintParam(print)}
      zatcaActive={zatca.active}
      zatcaEnabled={user.isOwner || !user.planBlocked?.includes("zatca.view")}
      canZatcaSend={can(user, "zatca.send")}
      canZatcaExport={can(user, "zatca.export")}
    />
  );
}
