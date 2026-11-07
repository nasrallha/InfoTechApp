// Server Component: شاشة الكاشير
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getPurchasePaymentMethods } from "@/lib/purchase-pages";
import { salePerms } from "@/lib/sale-pages";
import {
  getSaleCategories,
  getSaleCustomers,
} from "@/services/sale-catalog.service";
import { getOpenShift } from "@/services/shift.service";
import { getCompany } from "@/services/company.service";
import { getInvoicePrintSettings } from "@/services/invoice-print.service";
import PosScreen from "@/components/pos/PosScreen";
import { getActivePromotions } from "@/services/promotion.service";
import { bookingForSale } from "@/services/booking.service";
import { parseId } from "@/lib/purchase-pages";
import { hasModule } from "@/lib/modules";
import {
  getLaundryOrder,
  getOrdersToInvoice,
  getReceiveCatalog,
} from "@/services/laundry-order.service";
import NoAccess from "@/components/common/NoAccess";
import { getRestaurantPosCatalog } from "@/services/restaurant-pos.service";
import FullPageLoader from "@/components/common/FullPageLoader";

async function Content({ searchParams }) {
  const { user, allowed } = await getPageAccess("sales.pos");
  if (!allowed) return <NoAccess />;

  await connection();
  // فاتورة من حجز (?booking=ID): الخدمات بمقدم الخدمة + العميل
  const {
    booking: bk,
    laundryOrders: lo,
    editOrder: eo,
  } = (await searchParams) ?? {};
  const bookingId = parseId(bk);
  // المغسلة (وحدة laundry): الكاشير بيبقى شاشة المغسلة (قطعها + طلباتها)
  // ?laundryOrders=1,2,3 من شاشة الطلبات ← الطلبات في السلة للفوترة
  // المطعم له الأولوية (لو الوحدتين مفعّلين بالغلط الكاشير يبقى مطعم)
  const restaurantOn = await hasModule("restaurant");
  const laundryOn = !restaurantOn && (await hasModule("laundry"));
  const laundryIds =
    laundryOn && typeof lo === "string"
      ? [...new Set(lo.split(",").map(Number))]
          .filter((x) => Number.isInteger(x) && x > 0)
          .slice(0, 100)
      : [];
  const [
    categories,
    customers,
    { methods, creditMethod },
    shift,
    company,
    printSettings,
    promotions,
    booking,
  ] = await Promise.all([
    getSaleCategories(),
    getSaleCustomers(),
    getPurchasePaymentMethods(),
    getOpenShift(user),
    getCompany(),
    getInvoicePrintSettings(),
    getActivePromotions(user.branch.id),
    bookingId ? bookingForSale(bookingId, user).catch(() => null) : null,
  ]);
  // ?editOrder=id: تعديل طلب (قبل ما يجهز ومن غير فاتورة)
  const editId = laundryOn ? parseId(eo) : null;
  const [laundryCatalog, laundryOrders, laundryEdit] = laundryOn
    ? await Promise.all([
        getReceiveCatalog(),
        laundryIds.length ? getOrdersToInvoice(laundryIds, user) : [],
        editId ? getLaundryOrder(editId, user).catch(() => null) : null,
      ])
    : [null, [], null];
  // المطعم (وحدة restaurant): الكاشير بالمنيو (الأحجام والإضافات والتطبيقات والرسوم)
  const restaurant =
    restaurantOn ? await getRestaurantPosCatalog(user) : null;

  return (
    <PosScreen
      key={
        booking
          ? `booking-${booking.id}`
          : laundryIds.length
            ? `laundry-${laundryIds.join("-")}`
            : editId
              ? `edit-${editId}`
              : "pos"
      }
      booking={booking}
      user={{
        id: user.id,
        arFullname: user.arFullname,
        enFullname: user.enFullname,
      }}
      branch={user.branch}
      shift={shift}
      categories={categories}
      customers={customers}
      methods={methods}
      creditMethod={creditMethod}
      perms={salePerms(user)}
      promotions={promotions}
      company={company}
      printSettings={printSettings}
      laundry={laundryCatalog}
      laundryOrders={laundryOrders}
      laundryEdit={laundryEdit}
      restaurant={restaurant}
    />
  );
}

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
