// Server Component: يجيب الوحدات من قاعدة البيانات ويرسلها جاهزة
import { Suspense } from "react";
import { getPageAccess } from "@/lib/auth";
import NoAccess from "@/components/common/NoAccess";
import { connection } from "next/server";
import { getUnits } from "@/services/unit.service";
import UnitsView from "@/components/units/UnitsView";
import TableSkeleton from "@/components/common/TableSkeleton";

async function UnitsContent() {
  // لازم يكون مسجل دخول ويملك صلاحية "units.view"
  const { allowed } = await getPageAccess("units.view");
  if (!allowed) return <NoAccess />;

  // البيانات تتغير، فنجلبها مع كل طلب وليس وقت البناء
  await connection();
  const units = await getUnits();
  return <UnitsView units={units} />;
}

export default function UnitsPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <UnitsContent />
    </Suspense>
  );
}
