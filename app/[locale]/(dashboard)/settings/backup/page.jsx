// Server Component: الإعدادات ← النسخ الاحتياطي والاسترجاع (لمالك البرنامج)
// مجلد الحفظ، النسخ التلقائي، الاسترجاع، رفع ملف، الحذف
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { listBackups } from "@/services/backup.service";
import BackupView from "@/components/admin/BackupView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  // backups.settings صلاحية مالك: لغيره "الصفحة غير موجودة"
  const { user, allowed } = await getPageAccess("backups.settings");
  if (!allowed) return <NoAccess />;
  await connection();
  const data = await listBackups();
  return (
    <BackupView
      full
      initialData={data}
      perms={{
        create: can(user, "backups.create"),
        download: can(user, "backups.download"),
        delete: can(user, "backups.delete"),
        settings: can(user, "backups.settings"),
        restore: can(user, "backups.restore"),
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
