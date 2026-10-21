import { notFound } from "next/navigation";
// Server Component: الربط مع الزكاة (الفوترة الإلكترونية)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { getZatcaOverview } from "@/services/zatca.service";
import { getZatcaSettings } from "@/services/zatca-invoice.service";
import ZatcaView from "@/components/zatca/ZatcaView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { user, allowed } = await getPageAccess("zatca.view");
  if (!allowed) return <NoAccess />;
  // شاشة الربط (التسجيل والشهادات والإعدادات) لمالك البرنامج بس
  // (متابعة الفواتير وإعادة الإرسال في شاشة تانية للمدير)
  if (user.ownerMode && !can(user, "zatca.setup")) notFound();
  await connection();
  const [data, settings] = await Promise.all([
    getZatcaOverview(),
    getZatcaSettings(),
  ]);
  return (
    <ZatcaView
      data={data}
      settings={settings}
      canSetup={can(user, "zatca.setup")}
    />
  );
}

export default function ZatcaPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
