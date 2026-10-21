// Server Component: يجيب الأدوار من قاعدة البيانات ويرسلها جاهزة
import { Suspense } from "react";
import { connection } from "next/server";
import { getRoles } from "@/services/role.service";
import RolesView from "@/components/roles/RolesView";
import TableSkeleton from "@/components/common/TableSkeleton";

async function RolesContent() {
  // البيانات تتغير، فنجلبها مع كل طلب وليس وقت البناء
  await connection();
  const roles = await getRoles();
  return <RolesView roles={roles} />;
}

export default function RolesPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <RolesContent />
    </Suspense>
  );
}
