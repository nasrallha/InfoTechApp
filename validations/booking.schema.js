import { z } from "zod";
import { idField, optionalText } from "./common.schema";
import { isDay } from "@/lib/dates";

// ============================================================
// الحجوزات (وحدة bookings)
// ============================================================
const dayField = z.string().refine(isDay, "InvalidDate");
const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "InvalidTime");
const phoneField = z
  .string({ error: "RequiredField" })
  .trim()
  .min(5, "RequiredField")
  .max(30, "TextTooLong");

const bookingFields = {
  customerId: idField.nullish(),
  customerName: optionalText(150),
  phone: optionalText(30),
  technicianId: idField.nullish(),
  serviceIds: z.array(idField).min(1, "BookingNoServices").max(30),
  day: dayField,
  time: timeField,
  atHome: z.boolean().default(false),
  address: optionalText(500),
  locationUrl: optionalText(500),
  notes: optionalText(500),
};
export const createBookingSchema = z.object(bookingFields);
export const updateBookingSchema = z.object({ ...bookingFields, id: idField });

export const bookingStatusSchema = z.object({
  id: idField,
  status: z.enum(["booked", "arrived", "done", "cancelled", "noShow"]),
});

export const bookingListSchema = z.object({
  from: dayField.optional(),
  to: dayField.optional(),
  status: z
    .enum(["all", "booked", "arrived", "done", "cancelled", "noShow"])
    .default("all"),
  technicianId: idField.optional(),
  q: z.string().trim().max(50).default(""),
});

export const posBookingsSchema = z.object({
  q: z.string().trim().max(50).default(""),
  customerId: idField.optional(),
});

export const bookingSlotsSchema = z.object({
  day: dayField,
  durationMin: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .default(0),
  technicianId: idField.nullish(),
  excludeId: idField.nullish(),
});

// ---------- لينك الحجز (من غير تسجيل دخول) ----------
const codeField = z.string().trim().min(1).max(16);
export const publicInfoSchema = z.object({ code: codeField });
export const publicSlotsSchema = z.object({
  code: codeField,
  branchId: idField,
  day: dayField,
  serviceIds: z.array(idField).max(30).default([]),
  technicianId: idField.nullish(),
});
export const publicCreateSchema = z.object({
  code: codeField,
  branchId: idField,
  customerName: z
    .string({ error: "RequiredField" })
    .trim()
    .min(2, "RequiredField")
    .max(150, "TextTooLong"),
  phone: phoneField,
  technicianId: idField.nullish(),
  serviceIds: z.array(idField).min(1, "BookingNoServices").max(30),
  day: dayField,
  time: timeField,
  atHome: z.boolean().default(false),
  address: optionalText(500),
  locationUrl: optionalText(500),
  notes: optionalText(500),
});
export const publicFindSchema = z.object({
  code: codeField,
  // واحد منهم: رقم الحجز أو الجوال
  number: z.number().int().positive().nullish(),
  phone: optionalText(30),
});
