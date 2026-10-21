// Server Component: صفحة الإعدادات العامة
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { getSystemSettings } from "@/services/system-settings.service";
import SystemSettingsForm from "@/components/settings/system/SystemSettingsForm";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function SystemSettingsContent() {
  const { user, allowed } = await getPageAccess("systemSettings.view");
  if (!allowed) return <NoAccess />;

  await connection();
  const settings = await getSystemSettings();

  return (
    <SystemSettingsForm
      settings={settings}
      canEdit={can(user, "systemSettings.update")}
    />
  );
}

export default function SystemSettingsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <SystemSettingsContent />
    </Suspense>
  );
}
