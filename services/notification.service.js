import "server-only";
import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import {
  dayEnd,
  dayOf as localDay,
  dayToDbDate,
  dbDateToDay,
  today,
} from "@/lib/dates";
import { getZatcaAlerts } from "@/services/zatca-invoice.service";
import { AGENT_LATE_DAYS } from "@/services/warranty-claim.service";
import { dueFollowUps } from "@/services/follow-up.service";
import { dueVehicleChanges } from "@/services/vehicle.service";
import { todayBookings } from "@/services/booking.service";
import { getTranslations } from "next-intl/server";
import { hasFeature } from "@/lib/plan-features";
import { listBatches } from "@/services/batch.service";
import { getVisibleWarehouses } from "@/services/stock.service";
import { autoDisposeExpired } from "@/services/stock-adjustment.service";

// ============================================================
// قايمة الإشعارات الموحدة (الجرس في الهيدر)
// كل نوع بيظهر بس للي عنده صلاحيته ولو الوحدة مفعّلة:
// - الزكاة: فواتير معلّقة/مرفوضة/متأخرة، شهادة قربت تنتهي، الخدمة واقفة
// - مواعيد التركيب (سطور الفواتير): المتأخر + خلال أسبوع
// - زيارات عقود الصيانة: المتأخر + خلال أسبوع
// - عقود الصيانة اللي قربت تخلص: خلال شهر (عشان التجديد)
// - طلبات الضمان المتأخرة عند الوكيل
// ============================================================

// قبل الميعاد بكام يوم يبدأ التنبيه
export const JOB_SOON_DAYS = 7;
export const CONTRACT_END_DAYS = 30;
const LIMIT = 60;

const DAY_MS = 86_400_000;
const branchScope = (user) =>
  can(user, "allBranches.view") ? {} : { branchId: user.branch.id };
// يوم + عدد أيام (نص YYYY-MM-DD)
const addDays = (day, n) =>
  new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10);
// الفرق بالأيام بين يوم واليوم الحالي (سالب = فات)
const daysFrom = (day, todayDay) =>
  Math.round((Date.parse(day) - Date.parse(todayDay)) / DAY_MS);
const levelOf = (days) =>
  days < 0 ? "overdue" : days === 0 ? "today" : "soon";
const nameSel = { select: { arName: true, enName: true } };

async function saleJobs(user, todayDay) {
  // لحد آخر الأسبوع الجاي (الموعد فيه وقت، بتوقيت السعودية)
  const until = dayEnd(addDays(todayDay, JOB_SOON_DAYS));
  const rows = await prisma.saleItem.findMany({
    where: {
      jobStatus: "pending",
      jobAt: { not: null, lte: until },
      sale: { type: "sale", ...branchScope(user) },
    },
    orderBy: { jobAt: "asc" },
    take: LIMIT,
    select: {
      id: true,
      arName: true,
      enName: true,
      jobAt: true,
      jobAddress: true,
      technician: nameSel,
      sale: {
        select: {
          id: true,
          number: true, docCode: true,
          customerArName: true,
          customerEnName: true,
          customer: { select: { phone: true } },
        },
      },
    },
  });
  return rows.map((r) => {
    const days = daysFrom(localDay(r.jobAt), todayDay);
    return {
      key: `job-${r.id}`,
      kind: "job",
      level: levelOf(days),
      days,
      at: r.jobAt,
      title: { arName: r.arName, enName: r.enName },
      customer: {
        arName: r.sale.customerArName,
        enName: r.sale.customerEnName,
      },
      phone: r.sale.customer?.phone ?? null,
      address: r.jobAddress,
      technician: r.technician,
      ref: { kind: "sale", number: r.sale.number, docCode: r.sale.docCode },
      href: `/invoices/sales/${r.sale.id}`,
    };
  });
}

async function contractVisits(user, todayDay) {
  const until = dayToDbDate(addDays(todayDay, JOB_SOON_DAYS));
  const rows = await prisma.maintenanceVisit.findMany({
    where: {
      status: "pending",
      dueDate: { lte: until },
      contract: { status: "active", ...branchScope(user) },
    },
    orderBy: { dueDate: "asc" },
    take: LIMIT,
    select: {
      id: true,
      dueDate: true,
      technician: nameSel,
      contract: {
        select: {
          id: true,
          number: true, docCode: true,
          deviceName: true,
          address: true,
          technician: nameSel,
          customer: { select: { arName: true, enName: true, phone: true } },
        },
      },
    },
  });
  return rows.map((v) => {
    const day = dbDateToDay(v.dueDate);
    const days = daysFrom(day, todayDay);
    return {
      key: `visit-${v.id}`,
      kind: "visit",
      level: levelOf(days),
      days,
      at: day,
      title: {
        arName: v.contract.deviceName,
        enName: v.contract.deviceName,
      },
      customer: v.contract.customer,
      phone: v.contract.customer?.phone ?? null,
      address: v.contract.address,
      technician: v.technician ?? v.contract.technician,
      ref: { kind: "contract", number: v.contract.number, docCode: v.contract.docCode },
      href: `/maintenance-contracts/${v.contract.id}`,
    };
  });
}

async function endingContracts(user, todayDay) {
  const from = dayToDbDate(todayDay);
  const until = dayToDbDate(addDays(todayDay, CONTRACT_END_DAYS));
  const rows = await prisma.maintenanceContract.findMany({
    where: {
      ...branchScope(user),
      status: "active",
      endDate: { gte: from, lte: until },
    },
    orderBy: { endDate: "asc" },
    take: LIMIT,
    select: {
      id: true,
      number: true, docCode: true,
      deviceName: true,
      endDate: true,
      customer: { select: { arName: true, enName: true, phone: true } },
    },
  });
  return rows.map((c) => {
    const day = dbDateToDay(c.endDate);
    const days = daysFrom(day, todayDay);
    return {
      key: `contract-end-${c.id}`,
      kind: "contractEnd",
      level: days <= 7 ? "today" : "soon",
      days,
      at: day,
      title: { arName: c.deviceName, enName: c.deviceName },
      customer: c.customer,
      phone: c.customer?.phone ?? null,
      ref: { kind: "contract", number: c.number, docCode: c.docCode },
      href: `/maintenance-contracts/${c.id}`,
    };
  });
}

async function lateClaims(user) {
  const late = new Date(Date.now() - AGENT_LATE_DAYS * DAY_MS);
  const rows = await prisma.warrantyClaim.findMany({
    where: { ...branchScope(user), status: "at_agent", sentAt: { lt: late } },
    orderBy: { sentAt: "asc" },
    take: LIMIT,
    select: {
      id: true,
      number: true, docCode: true,
      sentAt: true,
      deviceName: true,
      customerName: true,
      customerPhone: true,
      product: nameSel,
      supplier: nameSel,
      customer: { select: { arName: true, enName: true, phone: true } },
    },
  });
  return rows.map((c) => ({
    key: `claim-late-${c.id}`,
    kind: "claimLate",
    level: "overdue",
    // عدد الأيام عند الوكيل
    days: Math.floor((Date.now() - c.sentAt.getTime()) / DAY_MS),
    at: c.sentAt,
    title: c.product ?? {
      arName: c.deviceName ?? "",
      enName: c.deviceName ?? "",
    },
    customer: c.customer ?? {
      arName: c.customerName ?? "",
      enName: c.customerName ?? "",
    },
    phone: c.customer?.phone ?? c.customerPhone ?? null,
    supplier: c.supplier,
    ref: { kind: "claim", number: c.number, docCode: c.docCode },
    href: `/warranty-claims/${c.id}`,
  }));
}

// ------------------------------------------------------------
// المطعم: الطلبات الأونلاين الجديدة (لسه ماتقبلتش) + المقبولة اللي ميعادها جاي
// (في المحل: الطاولة وعدد الأفراد | سفري: بيتغلف) - بالاسم والجوال والميعاد
// ------------------------------------------------------------
const ORDER_TYPE = {
  dinein: ["في المحل (حجز طاولة)", "Dine-in (table)"],
  takeaway: ["سفري", "Takeaway"],
};
async function restaurantOrders(user) {
  const since = new Date(Date.now() - 2 * 3600_000);
  const rows = await prisma.restaurantOrder.findMany({
    where: {
      ...branchScope(user),
      source: "online",
      OR: [
        { status: "pending" },
        { status: "open", pickupAt: { gte: since } },
      ],
    },
    orderBy: { pickupAt: "asc" },
    take: 40,
    select: {
      id: true,
      dailyNo: true,
      status: true,
      orderType: true,
      tableNo: true,
      partySize: true,
      pickupAt: true,
      createdAt: true,
      customerName: true,
      phone: true,
      notes: true,
    },
  });
  const now = Date.now();
  return rows.map((o) => {
    const [ar, en] = ORDER_TYPE[o.orderType] ?? ORDER_TYPE.takeaway;
    const table = o.tableNo
      ? [` · طاولة ${o.tableNo}`, ` · table ${o.tableNo}`]
      : ["", ""];
    const party = o.partySize
      ? [` · ${o.partySize} أفراد`, ` · ${o.partySize} people`]
      : ["", ""];
    const at = o.pickupAt ?? o.createdAt;
    return {
      key: `rorder-${o.id}-${o.status}`,
      kind: "restaurantOrder",
      level: at.getTime() < now ? "overdue" : "today",
      days: 0,
      at,
      // الجديد مكتوب عليه «جديد» عشان الكاشير يقبله
      title: {
        arName: `${o.status === "pending" ? "جديد · " : ""}${ar}${table[0]}${party[0]}`,
        enName: `${o.status === "pending" ? "New · " : ""}${en}${table[1]}${party[1]}`,
      },
      customer: { arName: o.customerName ?? "", enName: o.customerName ?? "" },
      phone: o.phone,
      address: o.notes || null,
      ref: { kind: "restaurantOrder", number: o.dailyNo },
      href: "/pos",
    };
  });
}

const LEVEL_ORDER = { overdue: 0, today: 1, soon: 2 };

// تتبع الصلاحية: عدد الدفعات المنتهية واللي قربت تنتهي في مستودعات المستخدم
// (ولو "إتلاف المنتهي تلقائياً" شغال ← بيتعمل تالف الأول)
async function expiryAlerts(user) {
  if (can(user, "stockAdjustments.add")) {
    const t = await getTranslations("BatchesReport");
    await autoDisposeExpired(user, t("AutoDisposeReason")).catch(() => null);
  }
  const ids = (await getVisibleWarehouses(user)).map((w) => w.id);
  if (!ids.length) return null;
  const data = await listBatches({ status: "all" }, ids, prisma);
  return {
    expired: data.totals.expired.count,
    near: data.totals.near.count,
  };
}

export async function getNotifications(user) {
  const todayDay = today();
  const [techOn, contractsOn, claimsOn, followUpsOn, vehiclesOn, bookingsOn, restaurantOn] =
    await Promise.all([
      hasModule("technicians"),
      hasModule("maintenanceContracts"),
      hasModule("warrantyClaims"),
      hasModule("followUps"),
      hasModule("vehicles"),
      hasModule("bookings"),
      hasModule("restaurant"),
    ]);
  const expiryOn = await hasFeature("expiry");
  const [zatca, expiry, ...lists] = await Promise.all([
    can(user, "zatca.view")
      ? getZatcaAlerts(user).catch(() => null)
      : Promise.resolve(null),
    expiryOn && can(user, "batches.view")
      ? expiryAlerts(user).catch(() => null)
      : Promise.resolve(null),
    techOn && can(user, "technicians.jobs")
      ? saleJobs(user, todayDay)
      : Promise.resolve([]),
    contractsOn && can(user, "maintenanceContracts.visits")
      ? contractVisits(user, todayDay)
      : Promise.resolve([]),
    contractsOn && can(user, "maintenanceContracts.view")
      ? endingContracts(user, todayDay)
      : Promise.resolve([]),
    claimsOn && can(user, "warrantyClaims.view")
      ? lateClaims(user)
      : Promise.resolve([]),
    // المتابعة الدورية (الفلاتر): المتأخر + اللي جاي خلال أسبوع
    followUpsOn && can(user, "followUps.view")
      ? dueFollowUps(user, JOB_SOON_DAYS)
      : Promise.resolve([]),
    // تغيير الزيت للسيارات (الورش): المتأخر + اللي جاي خلال أسبوع
    vehiclesOn && can(user, "vehicles.view")
      ? dueVehicleChanges(user, JOB_SOON_DAYS)
      : Promise.resolve([]),
    // حجوزات النهارده اللي لسه ما وصلتش (الكوافير / الحلاق / المساج)
    bookingsOn && can(user, "bookings.view")
      ? todayBookings(user)
      : Promise.resolve([]),
    // المطعم: الطلبات الأونلاين (الجديدة + المقبولة اللي جاية)
    restaurantOn && can(user, "sales.pos")
      ? restaurantOrders(user)
      : Promise.resolve([]),
  ]);
  // الأهم الأول: المتأخر ← النهارده ← الجاي، وجوه كل مستوى بالأقرب
  const items = lists
    .flat()
    .sort(
      (a, b) =>
        LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
        (a.kind === "claimLate" ? -a.days : a.days) -
          (b.kind === "claimLate" ? -b.days : b.days),
    );
  return { zatca: zatca?.enabled ? zatca : null, expiry, items };
}
