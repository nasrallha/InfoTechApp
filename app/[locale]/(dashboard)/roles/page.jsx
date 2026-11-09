// Server Component: يجيب الأدوار من قاعدة البيانات ويرسلها جاهزة
import { Suspense } from "react";
import { connection } from "next/server";
import { getRoles } from "@/services/role.service";
import { customRolesAllowed } from "@/lib/plan-features";
import { getCurrentUser } from "@/lib/auth";
import { multiTenant } from "@/lib/tenant";
import RolesView from "@/components/roles/RolesView";
import TableSkeleton from "@/components/common/TableSkeleton";

async function RolesContent() {
  // البيانات تتغير، فنجلبها مع كل طلب وليس وقت البناء
  await connection();
  const [roles, planAllows, user] = await Promise.all([
    getRoles(),
    customRolesAllowed(),
    getCurrentUser(),
  ]);
  // التحكم في الأدوار: الباقة فيها "أدوار خاصة"، أو مالك البرنامج
  const customAllowed = planAllows || Boolean(user?.isOwner);
  return (
    <RolesView
      roles={roles}
      customAllowed={customAllowed}
      // الأدوار الثابتة: مقفولة على العميل، ومالك البرنامج يعدّلها للشركة دي
      lockFixed={multiTenant() && !user?.isOwner}
      // الدور الثابت مبيتمسحش في وضع الشركات (حتى للمالك: اللوحة بترجّعه)
      lockDelete={multiTenant()}
    />
  );
}

export default function RolesPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <RolesContent />
    </Suspense>
  );
}
