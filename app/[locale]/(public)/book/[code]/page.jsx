// لينك الحجز للعملاء (من غير تسجيل دخول): /ar/book/<كود الشركة>
import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { withPublicCompany } from "@/lib/public-company";
import { publicBookingInfo } from "@/services/booking.service";
import FullPageLoader from "@/components/common/FullPageLoader";
import PublicBooking from "@/components/bookings/PublicBooking";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "PublicBooking" });
  return { title: t("Title") };
}

async function Content({ params }) {
  await connection();
  const { code } = await params;
  let info = null;
  try {
    info = await withPublicCompany(code, "bookings", () => publicBookingInfo());
  } catch (e) {
    console.error("[booking] public page:", e?.code ?? e?.message ?? e);
  }
  return <PublicBooking code={code} info={info} />;
}

export default function Page({ params }) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Content params={params} />
    </Suspense>
  );
}
