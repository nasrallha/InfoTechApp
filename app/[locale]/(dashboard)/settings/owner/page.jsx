// Server Component: الإعدادات ← حساب المالك (لمالك البرنامج بس)
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { ownerProfile } from "@/services/owner.service";
import OwnerAccountForm from "@/components/settings/owner/OwnerAccountForm";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const user = await requireUser();
  if (!user.isOwner || !user.ownerMode) notFound();
  await connection();
  return <OwnerAccountForm profile={ownerProfile(user)} />;
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
