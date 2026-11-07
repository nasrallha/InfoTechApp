// لينك الطلب الأونلاين للعملاء (من غير تسجيل دخول): /ar/order/<كود الشركة>
import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { withPublicCompany } from "@/lib/public-company";
import { publicMenuInfo } from "@/services/restaurant-online.service";
import FullPageLoader from "@/components/common/FullPageLoader";
import PublicOrder from "@/components/restaurant/PublicOrder";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "PublicOrder" });
  return { title: t("Title") };
}

async function Content({ params }) {
  await connection();
  const { code } = await params;
  let info = null;
  try {
    info = await withPublicCompany(code, "restaurant", () => publicMenuInfo());
  } catch (e) {
    console.error("[order] public page:", e?.code ?? e?.message ?? e);
  }
  return <PublicOrder code={code} info={info} />;
}

export default function Page({ params }) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Content params={params} />
    </Suspense>
  );
}
