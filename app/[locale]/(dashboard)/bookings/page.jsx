// الحجوزات (وحدة bookings) - ?q=BK-12 من الإشعار
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getSaleCustomers } from "@/services/sale-catalog.service";
import {
  bookableServices,
  bookingSettings,
  bookingStaff,
} from "@/services/booking.service";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";
import BookingsView from "@/components/bookings/BookingsView";

async function Content({ searchParams }) {
  const { allowed } = await getPageAccess("bookings.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const q = typeof sp?.q === "string" ? sp.q.slice(0, 50) : "";
  const [services, staff, customers, settings] = await Promise.all([
    bookableServices(),
    bookingStaff(),
    getSaleCustomers(),
    bookingSettings(),
  ]);
  return (
    <BookingsView
      key={q}
      initialQ={q}
      services={services}
      staff={staff}
      settings={settings}
      customers={customers.map(({ id, code, arName, enName, phone }) => ({
        id,
        code,
        arName,
        enName,
        phone,
      }))}
    />
  );
}

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
