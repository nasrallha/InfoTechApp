// Server Component: نماذج صيغة عقود المقاولات
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { listTemplates } from "@/services/contracting.service";
import TemplatesView from "@/components/contracting/TemplatesView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { user, allowed } = await getPageAccess("contracting.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const templates = await listTemplates();
  return <TemplatesView templates={templates} canManage={can(user, "contracting.manage")} />;
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
