"use server";

// الحجوزات (وحدة bookings) + لينك الحجز للعملاء
import { assertPhones } from "@/lib/phone-check";
import { headers } from "next/headers";
import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { withPublicCompany } from "@/lib/public-company";
import { idField } from "@/validations/common.schema";
import {
  bookingListSchema,
  bookingSlotsSchema,
  bookingStatusSchema,
  posBookingsSchema,
  createBookingSchema,
  publicCreateSchema,
  publicFindSchema,
  publicInfoSchema,
  publicSlotsSchema,
  updateBookingSchema,
} from "@/validations/booking.schema";
import {
  availableSlots,
  createBooking,
  getBooking,
  listBookings,
  posBookingForSale,
  posBookingSetup,
  posBookings,
  publicBookingInfo,
  publicCreateBooking,
  publicFindBooking,
  setBookingStatus,
  updateBooking,
} from "@/services/booking.service";

export const listBookingsAction = async (input) =>
  runAction(bookingListSchema, input, (d, u) => listBookings(d, u), {
    permission: "bookings.view",
  });

export const getBookingAction = async (id) =>
  runAction(idField, id, (d, u) => getBooking(d, u), {
    permission: "bookings.view",
  });

// الكاشير: البحث عن الحجز وتحويله لفاتورة (صلاحية الكاشير)
export const posBookingsAction = async (input) =>
  runAction(posBookingsSchema, input, (d, u) => posBookings(d, u), {
    permission: "sales.pos",
  });

export const posBookingSetupAction = async () =>
  runAction(null, undefined, () => posBookingSetup(), {
    permission: "bookings.create",
  });

export const posBookingForSaleAction = async (id) =>
  runAction(idField, id, (d, u) => posBookingForSale(d, u), {
    permission: "sales.pos",
  });

export const createBookingAction = async (input) =>
  runAction(createBookingSchema, input, (d, u) => createBooking(d, u), {
    permission: "bookings.create",
  });

export const updateBookingAction = async (input) =>
  runAction(updateBookingSchema, input, (d, u) => updateBooking(d, u), {
    permission: "bookings.update",
  });

export const setBookingStatusAction = async (input) =>
  runAction(bookingStatusSchema, input, (d, u) => setBookingStatus(d, u), {
    permission: "bookings.update",
  });

export const bookingSlotsAction = async (input) =>
  runAction(
    bookingSlotsSchema,
    input,
    (d, u) => {
      return availableSlots({ ...d, branchId: u.branch.id });
    },
    { permission: "bookings.view" },
  );

// ============================================================
// لينك الحجز: من غير تسجيل دخول، الشركة من الكود اللي في اللينك
// ============================================================
// حد بسيط لكل جهاز (IP): عشان محدش يغرق الحجوزات
const hits = new Map();
async function limit(kind, max, windowMs) {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local";
  const key = `${kind}:${ip}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new AppError("TooManyRequests");
  list.push(now);
  hits.set(key, list);
}

// الشركة جاهزة + وحدة الحجوزات مفعّلة فيها
const inCompany = (code, fn) => withPublicCompany(code, "bookings", fn);

export const publicBookingInfoAction = async (input) =>
  runAction(
    publicInfoSchema,
    input,
    (d) => inCompany(d.code, () => publicBookingInfo()),
    { public: true },
  );

export const publicSlotsAction = async (input) =>
  runAction(
    publicSlotsSchema,
    input,
    async (d) => {
      await limit("slots", 120, 10 * 60_000);
      return inCompany(d.code, async () => {
        const { bookableServices } = await import("@/services/booking.service");
        const services = (await bookableServices()).filter((s) =>
          d.serviceIds.includes(s.id),
        );
        const durationMin = services.reduce(
          (s, x) => s + (x.durationMin || 0),
          0,
        );
        return availableSlots({
          day: d.day,
          durationMin,
          technicianId: d.technicianId ?? null,
          branchId: d.branchId,
        });
      });
    },
    { public: true },
  );

export const publicCreateBookingAction = async (input) =>
  runAction(
    publicCreateSchema,
    input,
    async ({ code, ...d }) => {
      await limit("book", 6, 30 * 60_000);
      // الجوال حسب بلد الشركة (العملة الأساسية)
      return inCompany(code, async () => {
        await assertPhones(d);
        return publicCreateBooking(d);
      });
    },
    { public: true },
  );

export const publicFindBookingAction = async (input) =>
  runAction(
    publicFindSchema,
    input,
    async ({ code, ...d }) => {
      await limit("find", 30, 10 * 60_000);
      return inCompany(code, () => publicFindBooking(d));
    },
    { public: true },
  );
