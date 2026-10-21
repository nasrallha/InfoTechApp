import { notFound } from "next/navigation";
// Server Component: الإعدادات ← الدخول والأمان
// (إعدادات الدخول، الأجهزة المسجّلة، سجل الدخول، الحسابات المقفولة)
// كل تبويب بصلاحيته، والصفحة تفتح لو عنده أي واحدة منهم
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { today } from "@/lib/dates";
import {
  getSecurity,
  listLocks,
  listLoginLog,
  listSessions,
  securityUsers,
} from "@/services/login-security.service";
import SecurityView from "@/components/settings/security/SecurityView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

// آخر 7 أيام
const weekAgo = () => {
  const d = new Date(`${today()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 6);
  return d.toISOString().slice(0, 10);
};

async function Content() {
  const user = await requireUser();
  // الدخول والأمان لمالك البرنامج بس (المدير بيفك القفل من شاشة المستخدمين)
  if (user.ownerMode && !user.isOwner) notFound();
  const perms = {
    settings: can(user, "loginSecurity.view"),
    update: can(user, "loginSecurity.update"),
    sessions: can(user, "loginSecurity.sessions"),
    endSessions: can(user, "loginSecurity.endSessions"),
    log: can(user, "loginSecurity.log"),
    unlock: can(user, "loginSecurity.unlock"),
  };
  if (!perms.settings && !perms.sessions && !perms.log && !perms.unlock)
    return <NoAccess />;

  await connection();
  const logFilters = {
    from: weekAgo(),
    to: today(),
    result: "all",
    userId: null,
  };
  const [settings, sessions, log, users, locks] = await Promise.all([
    perms.settings ? getSecurity() : null,
    perms.sessions ? listSessions(user) : null,
    perms.log ? listLoginLog(user, logFilters) : null,
    perms.log ? securityUsers(user) : null,
    perms.unlock ? listLocks(user) : null,
  ]);

  return (
    <SecurityView
      perms={perms}
      settings={settings}
      sessions={sessions}
      log={log}
      logFilters={logFilters}
      users={users ?? []}
      locks={locks}
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
