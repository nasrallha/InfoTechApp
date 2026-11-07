// Server Component: تواصل معنا (بيانات الدعم الفني من لوحة التحكم + الاشتراك)
import { Suspense } from "react";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { getVendor } from "@/lib/vendor";
import { getSubscription } from "@/lib/subscription";
import ContactView from "@/components/support/ContactView";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  await requireUser();
  await connection();
  const [vendor, sub] = await Promise.all([getVendor(), getSubscription()]);
  return (
    <ContactView
      vendor={vendor}
      subscription={
        sub
          ? {
              state: sub.state,
              planArName: sub.planArName ?? null,
              planEnName: sub.planEnName ?? null,
              companyCode: sub.companyCode ?? null,
              companySerial: sub.companySerial ?? null,
              endsAt: sub.endsAt ?? null,
              daysLeft: sub.daysLeft ?? null,
            }
          : null
      }
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
