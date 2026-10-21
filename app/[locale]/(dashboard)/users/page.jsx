// Server Component: صفحة المستخدمين
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getUsers } from "@/services/user.service";
import { getActiveRoles } from "@/services/role.service";
import { getActiveBranches } from "@/services/branch.service";
import UsersView from "@/components/users/UsersView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function UsersContent() {
  // لازم يكون مسجل دخول ويملك صلاحية "users.view"
  const { user, allowed } = await getPageAccess("users.view");
  if (!allowed) return <NoAccess />;

  await connection();

  // مدير النظام: كل الفروع، غيره: فرعه الحالي فقط
  const [users, roles, branches] = await Promise.all([
    getUsers(user),
    getActiveRoles(user),
    user.isSuper ? getActiveBranches() : [user.branch],
  ]);

  return <UsersView users={users} roles={roles} branches={branches} />;
}

export default function UsersPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <UsersContent />
    </Suspense>
  );
}
