// المغسلة (وحدة laundry): القطع وأسعارها، والخدمات، والإضافات
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getLaundryCatalog } from "@/services/laundry.service";
import { getWalletSettings } from "@/services/laundry-wallet.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import LaundryView from "@/components/laundry/LaundryView";

// tab: التاب اللي تفتح عليه (من نافذة المغسلة): prices | services | addons
const TABS = ["prices", "services", "addons", "settings"];

async function Content({ searchParams }) {
  const { allowed } = await getPageAccess("laundry.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const tab = TABS.includes(sp?.tab) ? sp.tab : "prices";
  const [catalog, walletSettings] = await Promise.all([
    getLaundryCatalog(),
    getWalletSettings(),
  ]);
  return (
    <LaundryView
      key={tab}
      catalog={catalog}
      walletSettings={walletSettings}
      initialTab={tab}
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
