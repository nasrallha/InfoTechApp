import "server-only";
import { docNumberWhere, nextBranchNumber } from "./sequence.service";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { dayEnd, dayOf, dayStart, today, TIME_ZONE } from "@/lib/dates";
import {
  getBranchSaleContext,
  saleProductSelect,
  toSaleProduct,
} from "./sale-catalog.service";

// ============================================================
// الحجوزات (وحدة bookings - الكوافير / الحلاق / المساج)
// - الحجز: عميل (مسجّل أو اسم + جوال) + خدمات + مقدم خدمة (اختياري) + ميعاد
// - المدة = مجموع مدد الخدمات (أو مدة الموعد الافتراضية من الإعدادات)
// - مقدم الخدمة ما ينفعش يتحجز له ميعادين على نفس الوقت
// - من البرنامج (staff) أو من لينك الحجز (online) من غير تسجيل دخول
// - الفاتورة من الحجز ← الحجز "تم" ومربوط بالفاتورة
// status: booked محجوز | arrived وصل | done تم | cancelled ملغي | noShow لم يحضر
// ============================================================

export const BOOKING_STATUSES = [
  "booked",
  "arrived",
  "done",
  "cancelled",
  "noShow",
];
// الحالات اللي بتحجز الوقت
const ACTIVE = ["booked", "arrived"];
const MIN_MS = 60_000;
const n = (v) => (v == null ? 0 : Number(v));

const branchScope = (user) =>
  !user || can(user, "allBranches.view") ? {} : { branchId: user.branch.id };

// الجوال: الأرقام العربية ← إنجليزي، ومن غير مسافات وشرط
export const normPhone = (v) =>
  String(v ?? "")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s\-()]/g, "")
    .trim();

// يوم + ساعة (بتوقيت السعودية) ← تاريخ
export const toDateTime = (day, time) => new Date(`${day}T${time}:00+03:00`);
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export const timeOf = (date) => timeFormat.format(new Date(date));
const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm ?? "0:0")
    .split(":")
    .map(Number);
  return (h || 0) * 60 + (m || 0);
};
const hhmm = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

// ------------------------------------------------------------
// إعدادات الحجز (الإعدادات العامة)
// ------------------------------------------------------------
export async function bookingSettings() {
  const s = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: {
      bookingOnline: true,
      bookingOpen: true,
      bookingClose: true,
      bookingSlotMin: true,
      bookingDaysAhead: true,
      bookingHome: true,
      bookingNote: true,
    },
  });
  return {
    bookingOnline: s?.bookingOnline ?? false,
    bookingOpen: s?.bookingOpen ?? "10:00",
    bookingClose: s?.bookingClose ?? "22:00",
    bookingSlotMin: s?.bookingSlotMin ?? 30,
    bookingDaysAhead: s?.bookingDaysAhead ?? 30,
    bookingHome: s?.bookingHome ?? false,
    bookingNote: s?.bookingNote ?? null,
  };
}

// الخدمات اللي بتتحجز (الخدمات النشطة)
export async function bookableServices() {
  const rows = await prisma.product.findMany({
    where: { isService: true, isActive: true },
    orderBy: [{ categoryId: "asc" }, { arName: "asc" }],
    take: 500,
    select: {
      id: true,
      code: true,
      arName: true,
      enName: true,
      price: true,
      durationMin: true,
      category: { select: { id: true, arName: true, enName: true } },
    },
  });
  return rows.map((r) => ({ ...r, price: n(r.price) }));
}

// مقدمو الخدمة النشطين (الاسم بس)
export async function bookingStaff() {
  return prisma.technician.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: { id: true, arName: true, enName: true },
  });
}

// ------------------------------------------------------------
// المواعيد الفاضية في يوم (لمدة معينة) لمقدم خدمة أو لأي حد فاضي
// ------------------------------------------------------------
export async function availableSlots({
  day,
  durationMin,
  technicianId,
  branchId,
  excludeId,
}) {
  const s = await bookingSettings();
  const open = minutesOf(s.bookingOpen);
  const close = minutesOf(s.bookingClose);
  const step = Math.max(5, s.bookingSlotMin || 30);
  const dur = Math.max(step, durationMin || 0);
  const staff = technicianId
    ? [technicianId]
    : (await bookingStaff()).map((x) => x.id);
  const busy = await prisma.booking.findMany({
    where: {
      status: { in: ACTIVE },
      ...(branchId ? { branchId } : {}),
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startAt: { lt: dayEnd(day) },
      endAt: { gt: dayStart(day) },
      ...(technicianId ? { technicianId } : {}),
    },
    select: { technicianId: true, startAt: true, endAt: true },
  });
  const nowMs = Date.now();
  const slots = [];
  for (let m = open; m + dur <= close; m += step) {
    const start = toDateTime(day, hhmm(m));
    if (start.getTime() < nowMs) continue;
    const end = new Date(start.getTime() + dur * MIN_MS);
    const overlaps = (b) => b.startAt < end && b.endAt > start;
    // مفيش مقدمين خدمة متسجلين: الوقت متاح
    const free = staff.length
      ? staff.filter(
          (id) => !busy.some((b) => b.technicianId === id && overlaps(b)),
        )
      : [null];
    if (free.length) slots.push({ time: hhmm(m), free });
  }
  return slots;
}

async function assertFree(db, { technicianId, startAt, endAt, excludeId }) {
  if (!technicianId) return;
  const clash = await db.booking.findFirst({
    where: {
      technicianId,
      status: { in: ACTIVE },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { number: true, docCode: true, startAt: true },
  });
  if (clash)
    throw new AppError(
      "BookingTimeTaken",
      { number: clash.number, time: timeOf(clash.startAt) },
      { time: "BookingTimeTaken" },
    );
}

// البيانات بعد التحقق (الخدمات، العميل، مقدم الخدمة، الوقت)
async function prepareBooking(data, { online = false } = {}) {
  const settings = await bookingSettings();
  const ids = [...new Set(data.serviceIds)];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isService: true, isActive: true },
    select: {
      id: true,
      arName: true,
      enName: true,
      price: true,
      durationMin: true,
    },
  });
  if (products.length !== ids.length)
    throw new AppError("ProductNotFound", null, {
      serviceIds: "ProductNotFound",
    });
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = ids.map((id) => {
    const p = byId.get(id);
    return {
      productId: p.id,
      arName: p.arName,
      enName: p.enName,
      price: n(p.price),
      durationMin: p.durationMin || 0,
    };
  });
  const total = items.reduce((s, i) => s + i.durationMin, 0);
  const duration = total > 0 ? total : settings.bookingSlotMin || 30;

  let customer = null;
  if (data.customerId && !online) {
    customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, arName: true, phone: true },
    });
    if (!customer)
      throw new AppError("CustomerNotFound", null, {
        customerId: "CustomerNotFound",
      });
  }
  // أونلاين: لو الجوال متسجل لعميل ← الحجز يتربط بيه
  if (online && data.phone) {
    customer = await prisma.customer.findFirst({
      where: { phone: normPhone(data.phone), isActive: true },
      select: { id: true, arName: true, phone: true },
    });
  }
  const customerName = (data.customerName || customer?.arName || "").trim();
  const phone = normPhone(data.phone || customer?.phone || "");
  if (!customerName)
    throw new AppError("RequiredField", null, {
      customerName: "RequiredField",
    });
  if (!phone)
    throw new AppError("RequiredField", null, { phone: "RequiredField" });

  if (data.technicianId) {
    const t = await prisma.technician.findFirst({
      where: { id: data.technicianId, isActive: true },
      select: { id: true },
    });
    if (!t)
      throw new AppError("TechnicianNotFound", null, {
        technicianId: "TechnicianNotFound",
      });
  }

  const startAt = toDateTime(data.day, data.time);
  if (Number.isNaN(startAt.getTime())) throw new AppError("InvalidDate");
  const endAt = new Date(startAt.getTime() + duration * MIN_MS);
  if (online) {
    if (startAt.getTime() < Date.now()) throw new AppError("BookingPastTime");
    const last = Date.now() + settings.bookingDaysAhead * 86_400_000;
    if (startAt.getTime() > last) throw new AppError("BookingTooFar");
    // جوه مواعيد العمل
    const m = minutesOf(data.time);
    if (
      m < minutesOf(settings.bookingOpen) ||
      m + duration > minutesOf(settings.bookingClose)
    )
      throw new AppError("BookingOutsideHours");
    if (data.atHome && !settings.bookingHome)
      throw new AppError("BookingHomeOff");
  }

  return {
    header: {
      customerId: customer?.id ?? null,
      customerName,
      phone,
      technicianId: data.technicianId ?? null,
      startAt,
      endAt,
      atHome: Boolean(data.atHome),
      address: data.atHome ? (data.address ?? null) : null,
      locationUrl: data.atHome ? (data.locationUrl ?? null) : null,
      notes: data.notes ?? null,
    },
    items,
  };
}

const bookingSelect = {
  id: true,
  number: true, docCode: true,
  branchId: true,
  branch: { select: { id: true, arName: true, enName: true } },
  customerId: true,
  customer: { select: { id: true, code: true, arName: true, enName: true } },
  customerName: true,
  phone: true,
  technicianId: true,
  technician: { select: { id: true, arName: true, enName: true } },
  startAt: true,
  endAt: true,
  status: true,
  atHome: true,
  address: true,
  locationUrl: true,
  notes: true,
  source: true,
  saleId: true,
  sale: { select: { id: true, number: true, docCode: true, totalAmount: true } },
  createdAt: true,
  items: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      productId: true,
      arName: true,
      enName: true,
      price: true,
      durationMin: true,
    },
  },
};
const toDTO = (b) => ({
  ...b,
  items: b.items.map((i) => ({ ...i, price: n(i.price) })),
  sale: b.sale ? { ...b.sale, totalAmount: n(b.sale.totalAmount) } : null,
  total: b.items.reduce((s, i) => s + n(i.price), 0),
  day: dayOf(b.startAt),
  time: timeOf(b.startAt),
  endTime: timeOf(b.endAt),
});

// ------------------------------------------------------------
// إضافة / تعديل / الحالة
// ------------------------------------------------------------
async function createNow(data, { user, branchId, online }) {
  const { header, items } = await prepareBooking(data, { online });
  return prisma.$transaction(async (tx) => {
    await assertFree(tx, header);
    // الرقم التالي في فرع الحجز + رمز الفرع (DM-BK-5)
    const { number, docCode } = await nextBranchNumber(tx, "booking", branchId);
    const b = await tx.booking.create({
      data: {
        ...header,
        number,
        docCode,
        branchId,
        source: online ? "online" : "staff",
        createdById: user?.id ?? null,
        items: { create: items },
      },
      select: bookingSelect,
    });
    return toDTO(b);
  });
}

export async function createBooking(data, user) {
  await assertModule("bookings");
  return createNow(data, { user, branchId: user.branch.id, online: false });
}

async function findOwn(id, user) {
  const b = await prisma.booking.findFirst({
    where: { id, ...branchScope(user) },
    select: { id: true, status: true, branchId: true },
  });
  if (!b) throw new AppError("BookingNotFound");
  return b;
}

export async function updateBooking({ id, ...data }, user) {
  await assertModule("bookings");
  const b = await findOwn(id, user);
  if (!ACTIVE.includes(b.status)) throw new AppError("BookingClosed");
  const { header, items } = await prepareBooking(data);
  return prisma.$transaction(async (tx) => {
    await assertFree(tx, { ...header, excludeId: id });
    await tx.bookingItem.deleteMany({ where: { bookingId: id } });
    const row = await tx.booking.update({
      where: { id },
      data: { ...header, items: { create: items } },
      select: bookingSelect,
    });
    return toDTO(row);
  });
}

// الحالة: وصل / تم / ملغي / لم يحضر / رجوع لمحجوز
export async function setBookingStatus({ id, status }, user) {
  await assertModule("bookings");
  const b = await findOwn(id, user);
  if (status === "cancelled" && !can(user, "bookings.cancel"))
    throw new AppError("Forbidden");
  // رجوع حجز ملغي/لم يحضر: الوقت لازم يكون لسه فاضي
  if (ACTIVE.includes(status) && !ACTIVE.includes(b.status)) {
    const full = await prisma.booking.findUnique({
      where: { id },
      select: { technicianId: true, startAt: true, endAt: true },
    });
    await assertFree(prisma, { ...full, excludeId: id });
  }
  const row = await prisma.booking.update({
    where: { id },
    data: { status },
    select: bookingSelect,
  });
  return toDTO(row);
}

// ------------------------------------------------------------
// الشاشة والتقرير
// ------------------------------------------------------------
export async function listBookings(
  { from, to, status = "all", technicianId, q = "" },
  user,
) {
  await assertModule("bookings");
  const text = q.trim();
  // رقم الحجز: في فرع الرمز (DM-BK-5) أو فرع المستخدم
  const ref = text ? await docNumberWhere(text, user) : null;
  const where = {
    ...branchScope(user),
    ...(technicianId ? { technicianId } : {}),
    ...(text
      ? {
          OR: [
            ...(ref ? [ref] : []),
            { phone: { contains: text } },
            { customerName: { contains: text } },
          ],
        }
      : {
          startAt: {
            ...(from ? { gte: dayStart(from) } : {}),
            ...(to ? { lte: dayEnd(to) } : {}),
          },
        }),
  };
  const rows = await prisma.booking.findMany({
    where,
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    take: 2000,
    select: bookingSelect,
  });
  const all = rows.map(toDTO);
  const counts = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0]));
  for (const r of all) counts[r.status] = (counts[r.status] ?? 0) + 1;
  counts.all = all.length;
  return {
    rows: status === "all" ? all : all.filter((r) => r.status === status),
    counts,
  };
}

export async function getBooking(id, user) {
  await assertModule("bookings");
  const b = await prisma.booking.findFirst({
    where: { id, ...branchScope(user) },
    select: bookingSelect,
  });
  return b ? toDTO(b) : null;
}

// ------------------------------------------------------------
// الفاتورة من الحجز (الكاشير / فاتورة البيع): الخدمات بمقدم الخدمة
// ------------------------------------------------------------
export async function bookingForSale(id, user) {
  const b = await getBooking(id, user);
  if (!b || !ACTIVE.includes(b.status)) return null;
  const ctx = await getBranchSaleContext(b.branchId);
  const ids = [...new Set(b.items.map((i) => i.productId).filter(Boolean))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isActive: true },
    select: saleProductSelect(ctx),
  });
  const byId = new Map(products.map((p) => [p.id, toSaleProduct(p)]));
  return {
    id: b.id,
    number: b.number,
    customerId: b.customerId,
    customerName: b.customerName,
    phone: b.phone,
    technicianId: b.technicianId,
    items: b.items
      .map((i) => byId.get(i.productId))
      .filter(Boolean)
      .map((product) => ({ product, technicianId: b.technicianId })),
  };
}

// ------------------------------------------------------------
// الكاشير: الحجوزات المفتوحة (محجوز / وصل) في فرع الكاشير
// من غير بحث: حجوزات النهارده بس (customerId: حجوزات العميل النهارده)
// بالبحث: رقم الحجز أو الجوال أو الاسم في أي يوم
// ------------------------------------------------------------
export async function posBookings({ q = "", customerId }, user) {
  await assertModule("bookings");
  const text = q.trim();
  const todayDay = today();
  // رقم الحجز: في فرع الرمز (DM-BK-5) أو فرع المستخدم
  const ref = text ? await docNumberWhere(text, user) : null;
  const rows = await prisma.booking.findMany({
    where: {
      branchId: user.branch.id,
      status: { in: ACTIVE },
      ...(text
        ? {
            OR: [
              ...(ref ? [ref] : []),
              { phone: { contains: text } },
              { customerName: { contains: text } },
              { customer: { arName: { contains: text } } },
              { customer: { enName: { contains: text } } },
              { customer: { phone: { contains: text } } },
            ],
          }
        : {
            startAt: { gte: dayStart(todayDay), lte: dayEnd(todayDay) },
            ...(customerId ? { customerId } : {}),
          }),
    },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    take: 50,
    select: bookingSelect,
  });
  return rows.map(toDTO);
}

// الكاشير: بيانات شاشة إضافة / تعديل الحجز (بتتحمل لما تتفتح بس)
export async function posBookingSetup() {
  await assertModule("bookings");
  const [services, staff, settings] = await Promise.all([
    bookableServices(),
    bookingStaff(),
    bookingSettings(),
  ]);
  return { services, staff, settings };
}

// الكاشير: تحميل الحجز في السلة (لازم يكون في فرع الكاشير)
export async function posBookingForSale(id, user) {
  await assertModule("bookings");
  const b = await prisma.booking.findFirst({
    where: { id, branchId: user.branch.id },
    select: { id: true },
  });
  if (!b) throw new AppError("BookingNotFound");
  const data = await bookingForSale(id, null);
  if (!data) throw new AppError("BookingClosed");
  return data;
}

// الفاتورة اتحفظت ← الحجز "تم" ومربوط بيها
export async function linkBookingSale(tx, bookingId, saleId, user) {
  if (!bookingId) return;
  const { count } = await tx.booking.updateMany({
    where: {
      id: bookingId,
      status: { in: ACTIVE },
      ...branchScope(user),
    },
    data: { status: "done", saleId },
  });
  if (!count) throw new AppError("BookingClosed");
}

// الجرس: حجوزات النهارده اللي لسه ما اتعملتش (والمتأخر)
export async function todayBookings(user) {
  const todayDay = today();
  const rows = await prisma.booking.findMany({
    where: {
      ...branchScope(user),
      status: "booked",
      startAt: { gte: dayStart(todayDay), lte: dayEnd(todayDay) },
    },
    orderBy: { startAt: "asc" },
    take: 60,
    select: bookingSelect,
  });
  const now = Date.now();
  return rows.map((r) => {
    const b = toDTO(r);
    return {
      key: `booking-${b.id}-${b.time}`,
      kind: "booking",
      level: r.startAt.getTime() < now ? "overdue" : "today",
      days: 0,
      at: r.startAt,
      title: {
        arName: b.items.map((i) => i.arName).join("، ") || `BK-${b.number}`,
        enName: b.items.map((i) => i.enName).join(", ") || `BK-${b.number}`,
      },
      customer: { arName: b.customerName, enName: b.customerName },
      phone: b.phone,
      address: b.atHome ? b.address : null,
      technician: b.technician,
      ref: { kind: "booking", number: b.number, docCode: b.docCode },
      href: `/bookings?q=BK-${b.number}`,
    };
  });
}

// ============================================================
// لينك الحجز (من غير تسجيل دخول) - بيتنادى جوه runWithCompany
// ============================================================
export async function publicBookingInfo() {
  const [settings, company, branches, services, staff] = await Promise.all([
    bookingSettings(),
    prisma.company.findUnique({
      where: { id: 1 },
      select: { arName: true, enName: true, logo: true, phone: true },
    }),
    prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: {
        id: true,
        arName: true,
        enName: true,
        address: true,
        phone: true,
      },
    }),
    bookableServices(),
    bookingStaff(),
  ]);
  // صفحة العملاء: اسم الخدمة بس (من غير سعر ولا مدة)
  return {
    settings,
    company,
    branches,
    services: services.map(({ id, arName, enName }) => ({
      id,
      arName,
      enName,
    })),
    staff,
  };
}

export async function publicCreateBooking(data) {
  const settings = await bookingSettings();
  if (!settings.bookingOnline) throw new AppError("BookingOnlineOff");
  const branch = await prisma.branch.findFirst({
    where: { id: data.branchId, isActive: true },
    select: { id: true },
  });
  if (!branch) throw new AppError("BranchNotFound");
  const b = await createNow(
    { ...data, customerId: null },
    { user: null, branchId: branch.id, online: true },
  );
  // للعميل: الرقم والميعاد والخدمات بس
  return publicView(b);
}

const publicView = (b) => ({
  number: b.number,
  status: b.status,
  day: b.day,
  time: b.time,
  technician: b.technician,
  branch: b.branch,
  // من غير أسعار ولا مدة
  items: b.items.map((i) => ({ arName: i.arName, enName: i.enName })),
  atHome: b.atHome,
});

// العميل بيدور على حجزه: الرقم + الجوال لازم يطابقوا
// - برقم الحجز: الحجز ده
// - برقم الجوال: حجوزات النهارده واللي جاية (أي حالة)، ولو مفيش: آخر 3
// - الجوال بيتقارن بآخر 9 أرقام (05xxxxxxxx = +9665xxxxxxxx = ٠٥...)
export async function publicFindBooking({ number, phone }) {
  const tail = normPhone(phone).replace(/\D/g, "").slice(-9);
  // برقم الحجز: الرقم بيتكرر بين الفروع ← لو الجوال مكتوب لازم يطابق
  if (number) {
    const list = (
      await prisma.booking.findMany({
        where: { number },
        orderBy: { id: "desc" },
        take: 10,
        select: bookingSelect,
      })
    ).filter(
      (b) =>
        tail.length < 5 ||
        normPhone(b.phone).replace(/\D/g, "").slice(-9) === tail,
    );
    if (!list.length) throw new AppError("BookingNotFound");
    return list.map((b) => publicView(toDTO(b)));
  }
  if (tail.length < 5) throw new AppError("BookingNotFound");
  const samePhone = (b) =>
    normPhone(b.phone).replace(/\D/g, "").slice(-9) === tail;
  // حجوزات النهارده واللي جاية (أي حالة: محجوز / وصل / تم / ملغي)
  let list = (
    await prisma.booking.findMany({
      where: {
        phone: { contains: tail },
        startAt: { gte: dayStart(today()) },
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: 10,
      select: bookingSelect,
    })
  ).filter(samePhone);
  // مفيش جاي: آخر 3 حجوزات فاتت
  if (!list.length)
    list = (
      await prisma.booking.findMany({
        where: { phone: { contains: tail } },
        orderBy: [{ startAt: "desc" }, { id: "desc" }],
        take: 3,
        select: bookingSelect,
      })
    ).filter(samePhone);
  if (!list.length) throw new AppError("BookingNotFound");
  return list.map((b) => publicView(toDTO(b)));
}
