// Server Component: شاشة الكاشير
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getPurchasePaymentMethods } from "@/lib/purchase-pages";
import { salePerms } from "@/lib/sale-pages";
import {
  getSaleCategories,
  getSaleCustomers,
} from "@/services/sale-catalog.service";
import { getOpenShift } from "@/services/shift.service";
import { getCompany } from "@/services/company.service";
import { getInvoicePrintSettings } from "@/services/invoice-print.service";
import PosScreen from "@/components/pos/PosScreen";
import { getActivePromotions } from "@/services/promotion.service";
import NoAccess from "@/components/common/NoAccess";
import FullPageLoader from "@/components/common/FullPageLoader";

async function Content() {
  const { user, allowed } = await getPageAccess("sales.pos");
  if (!allowed) return <NoAccess />;

  await connection();
  const [
    categories,
    customers,
    { methods, creditMethod },
    shift,
    company,
    printSettings,
    promotions,
  ] = await Promise.all([
    getSaleCategories(),
    getSaleCustomers(),
    getPurchasePaymentMethods(),
    getOpenShift(user),
    getCompany(),
    getInvoicePrintSettings(),
    getActivePromotions(user.branch.id),
  ]);

  return (
    <PosScreen
      user={{
        id: user.id,
        arFullname: user.arFullname,
        enFullname: user.enFullname,
      }}
      branch={user.branch}
      shift={shift}
      categories={categories}
      customers={customers}
      methods={methods}
      creditMethod={creditMethod}
      perms={salePerms(user)}
      promotions={promotions}
      company={company}
      printSettings={printSettings}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Content />
    </Suspense>
  );
}
