// Server Component: الإدارة ← النسخ الاحتياطي (شاشة العميل: نسخة الآن + تنزيل)
// شاشة المالك الكاملة (المجلد، التلقائي، الاسترجاع): الإعدادات ← /settings/backup
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { listBackups } from "@/services/backup.service";
import BackupView from "@/components/admin/BackupView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { user, allowed } = await getPageAccess("backups.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const data = await listBackups();
  return (
    <BackupView
      initialData={data}
      perms={{
        create: can(user, "backups.create"),
        download: can(user, "backups.download"),
        delete: false,
        settings: false,
        restore: false,
      }}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
