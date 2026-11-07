import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { dayOf, dayToDbDate, dbDateToDay, today } from "@/lib/dates";
import { computeNextChange, hasChangeInterval } from "@/lib/vehicle-change";

// ============================================================
// السيارات (وحدة vehicles - الورش)
// - رقم اللوحة هو اللي بيتبحث بيه، وما يتكررش (plateKey من غير مسافات)
// - العميل اختياري (الزبون العابر: لوحة بس)
// - السجل: كل فواتير السيارة بالعداد والأصناف
// - التغيير الدوري (زيت...): من آخر سطر عليه "الغيار الجاي"
// ============================================================

const DAY_MS = 86_400_000;
// الغيار "قرب" قبل ميعاده بكام يوم
export const CHANGE_SOON_DAYS = 7;

// اللوحة: مسافة واحدة بين الأجزاء، والمفتاح من غير مسافات وبحروف كبيرة
export const cleanPlate = (v) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
export const plateKeyOf = (v) => cleanPlate(v).replace(/[\s-]/g, "");

const customerSelect = {
  select: { id: true, code: true, arName: true, enName: true, phone: true },
};
const baseSelect = {
  id: true,
  plateNo: true,
  vehicleType: true,
  customerId: true,
  customer: customerSelect,
  phone: true,
  notes: true,
};

// فواتير البيع اللي ما اترجعتش كلها
const liveSale = { type: "sale" };

// آخر زيارة + آخر عداد + الغيار الجاي لكل سيارة
async function enrich(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const todayDay = today();
  const [lastSales, changes] = await Promise.all([
    prisma.sale.findMany({
      where: { ...liveSale, vehicleId: { in: ids } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      select: { vehicleId: true, date: true, odometer: true },
    }),
    // آخر سطر تغيير دوري لكل سيارة (اللي ما اترجعش)
    prisma.saleItem.findMany({
      where: {
        sale: { ...liveSale, vehicleId: { in: ids } },
        OR: [{ nextKm: { not: null } }, { nextDate: { not: null } }],
      },
      orderBy: [{ sale: { date: "desc" } }, { id: "desc" }],
      select: {
        arName: true,
        enName: true,
        qty: true,
        returnedQty: true,
        nextKm: true,
        nextDate: true,
        sale: { select: { vehicleId: true, date: true, odometer: true } },
      },
    }),
  ]);
  const last = new Map();
  const lastKm = new Map();
  for (const s of lastSales) {
    if (!last.has(s.vehicleId)) last.set(s.vehicleId, s.date);
    if (s.odometer != null && !lastKm.has(s.vehicleId))
      lastKm.set(s.vehicleId, s.odometer);
  }
  const change = new Map();
  for (const c of changes) {
    const vid = c.sale.vehicleId;
    if (change.has(vid)) continue;
    if (Number(c.returnedQty) >= Number(c.qty) - 1e-9) continue;
    const next = c.nextDate ? dbDateToDay(c.nextDate) : null;
    const days =
      next != null
        ? Math.round((Date.parse(next) - Date.parse(todayDay)) / DAY_MS)
        : null;
    change.set(vid, {
      item: { arName: c.arName, enName: c.enName },
      date: c.sale.date,
      odometer: c.sale.odometer,
      nextKm: c.nextKm,
      nextDate: next,
      days,
      level:
        days == null
          ? null
          : days < 0
            ? "overdue"
            : days <= CHANGE_SOON_DAYS
              ? "soon"
              : "later",
    });
  }
  return rows.map((r) => ({
    ...r,
    lastVisit: last.get(r.id) ?? null,
    lastOdometer: lastKm.get(r.id) ?? null,
    change: change.get(r.id) ?? null,
  }));
}

// ------------------------------------------------------------
// شاشة السيارات
// ------------------------------------------------------------
export async function listVehicles({ q = "", filter = "all" }) {
  await assertModule("vehicles");
  const text = q.trim();
  const key = plateKeyOf(text);
  const rows = await prisma.vehicle.findMany({
    where: text
      ? {
          OR: [
            ...(key ? [{ plateKey: { contains: key } }] : []),
            { vehicleType: { contains: text } },
            { phone: { contains: text } },
            { customer: { arName: { contains: text } } },
            { customer: { enName: { contains: text } } },
            { customer: { phone: { contains: text } } },
          ],
        }
      : {},
    orderBy: { id: "desc" },
    take: 1000,
    select: baseSelect,
  });
  const all = await enrich(rows);
  const due = all.filter((r) => r.change && r.change.level !== "later");
  return {
    rows: filter === "due" ? due : all,
    counts: { all: all.length, due: due.length },
  };
}

// الاختيار في الفاتورة: بحث باللوحة (أو الجوال/العميل)
export async function searchVehicles(q) {
  await assertModule("vehicles");
  const text = q.trim();
  const key = plateKeyOf(text);
  const rows = await prisma.vehicle.findMany({
    where: text
      ? {
          OR: [
            ...(key ? [{ plateKey: { contains: key } }] : []),
            { phone: { contains: text } },
            { customer: { phone: { contains: text } } },
            { customer: { arName: { contains: text } } },
          ],
        }
      : {},
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: baseSelect,
  });
  return enrich(rows);
}

// أنواع السيارات اللي اتكتبت قبل كده (من غير تكرار) للاقتراح
export async function vehicleTypes() {
  await assertModule("vehicles");
  const rows = await prisma.vehicle.findMany({
    where: { vehicleType: { not: null } },
    distinct: ["vehicleType"],
    orderBy: { vehicleType: "asc" },
    take: 1000,
    select: { vehicleType: true },
  });
  // نفس النوع بحروف مختلفة (Camry / camry) يظهر مرة واحدة
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = r.vehicleType.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r.vehicleType.trim());
  }
  return out;
}

// النوع: لو اتكتب قبل كده بحروف تانية نستخدم المكتوب أول مرة (ما يتكررش)
async function normalizeType(type) {
  const t = type?.trim().replace(/\s+/g, " ");
  if (!t) return null;
  const same = await prisma.vehicle.findFirst({
    where: { vehicleType: t },
    select: { vehicleType: true },
  });
  return same?.vehicleType ?? t;
}

async function vehicleData(data) {
  const plateNo = cleanPlate(data.plateNo);
  const plateKey = plateKeyOf(plateNo);
  if (!plateKey)
    throw new AppError("RequiredField", null, { plateNo: "RequiredField" });
  if (data.customerId) {
    const c = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true },
    });
    if (!c)
      throw new AppError("CustomerNotFound", null, {
        customerId: "CustomerNotFound",
      });
  }
  return {
    plateNo,
    plateKey,
    vehicleType: await normalizeType(data.vehicleType),
    customerId: data.customerId ?? null,
    phone: data.phone ?? null,
    notes: data.notes ?? null,
  };
}

function handleUnique(e) {
  if (e?.code === "P2002")
    throw new AppError("VehiclePlateExists", null, {
      plateNo: "VehiclePlateExists",
    });
  throw e;
}

export async function createVehicle(data) {
  await assertModule("vehicles");
  try {
    const v = await prisma.vehicle.create({
      data: await vehicleData(data),
      select: baseSelect,
    });
    return (await enrich([v]))[0];
  } catch (e) {
    handleUnique(e);
  }
}

export async function updateVehicle({ id, ...data }) {
  await assertModule("vehicles");
  try {
    const v = await prisma.vehicle.update({
      where: { id },
      data: await vehicleData(data),
      select: baseSelect,
    });
    return (await enrich([v]))[0];
  } catch (e) {
    if (e?.code === "P2025") throw new AppError("VehicleNotFound");
    handleUnique(e);
  }
}

// السيارة اللي عليها فواتير ما تتمسحش (السجل بيضيع)
export async function deleteVehicle(id) {
  await assertModule("vehicles");
  const used = await prisma.sale.count({ where: { vehicleId: id } });
  if (used) throw new AppError("VehicleInUse");
  await prisma.vehicle.delete({ where: { id } }).catch((e) => {
    if (e?.code === "P2025") throw new AppError("VehicleNotFound");
    throw e;
  });
  return { id };
}

// ------------------------------------------------------------
// سجل السيارة: كل الفواتير (والمرتجعات) بالعداد والأصناف
// ------------------------------------------------------------
export async function vehicleHistory(id, user) {
  await assertModule("vehicles");
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    select: baseSelect,
  });
  if (!vehicle) throw new AppError("VehicleNotFound");
  const sales = await prisma.sale.findMany({
    where: {
      vehicleId: id,
      ...(can(user, "allBranches.view") ? {} : { branchId: user.branch.id }),
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 500,
    select: {
      id: true,
      type: true,
      number: true,
      date: true,
      odometer: true,
      totalAmount: true,
      branch: { select: { arName: true, enName: true } },
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          arName: true,
          enName: true,
          qty: true,
          returnedQty: true,
          totalAmount: true,
          nextKm: true,
          nextDate: true,
        },
      },
    },
  });
  return {
    vehicle: (await enrich([vehicle]))[0],
    sales: sales.map((s) => ({
      ...s,
      items: s.items.map((i) => ({
        ...i,
        nextDate: i.nextDate ? dbDateToDay(i.nextDate) : null,
      })),
    })),
  };
}

// ------------------------------------------------------------
// فاتورة البيع: السيارة (نسخة من بياناتها وقت البيع)
// ------------------------------------------------------------
export async function vehicleForSale(vehicleId) {
  if (!vehicleId) return null;
  await assertModule("vehicles");
  const v = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, plateNo: true, vehicleType: true, customerId: true },
  });
  if (!v)
    throw new AppError("VehicleNotFound", null, {
      vehicleId: "VehicleNotFound",
    });
  return v;
}

// الغيار الجاي على السطر: العداد + كل كام كم، والتاريخ + كل كام شهر
// choice (من الفاتورة): { applied, nextKm, nextDate }
// - applied = false: الصنف اتباع بس (ما اتغيّرش على السيارة) ← من غير ميعاد
// - الأرقام اللي اتكتبت في الفاتورة (تعديل يدوي) بتتاخد زي ما هي
export function nextChange(product, { odometer, date }, choice) {
  if (!hasChangeInterval(product)) return { nextKm: null, nextDate: null };
  if (choice && choice.applied === false)
    return { nextKm: null, nextDate: null };
  if (choice && (choice.nextKm != null || choice.nextDate)) {
    return {
      nextKm: choice.nextKm ?? null,
      nextDate: choice.nextDate ? dayToDbDate(choice.nextDate) : null,
    };
  }
  const { nextKm, nextDay } = computeNextChange({
    km: product.changeKm,
    months: product.changeMonths,
    odometer,
    day: dayOf(date),
  });
  return { nextKm, nextDate: nextDay ? dayToDbDate(nextDay) : null };
}

// ------------------------------------------------------------
// الجرس: السيارات اللي ميعاد غيارها (بالتاريخ) فات أو قرب
// (آخر تغيير للسيارة بس، والفواتير حسب فرع المستخدم)
// ------------------------------------------------------------
export async function dueVehicleChanges(user, soonDays = CHANGE_SOON_DAYS) {
  const todayDay = today();
  const until = dayToDbDate(
    new Date(Date.parse(todayDay) + soonDays * DAY_MS)
      .toISOString()
      .slice(0, 10),
  );
  const candidates = await prisma.saleItem.findMany({
    where: {
      nextDate: { not: null, lte: until },
      sale: {
        ...liveSale,
        vehicleId: { not: null },
        ...(can(user, "allBranches.view") ? {} : { branchId: user.branch.id }),
      },
    },
    orderBy: { nextDate: "asc" },
    take: 500,
    select: { sale: { select: { vehicleId: true } } },
  });
  const ids = [...new Set(candidates.map((c) => c.sale.vehicleId))];
  if (!ids.length) return [];
  const vehicles = await enrich(
    await prisma.vehicle.findMany({
      where: { id: { in: ids } },
      select: baseSelect,
    }),
  );
  return vehicles
    .filter((v) => v.change && ["overdue", "soon"].includes(v.change.level))
    .sort((a, b) => a.change.days - b.change.days)
    .slice(0, 60)
    .map((v) => ({
      key: `oil-${v.id}-${v.change.nextDate}`,
      kind: "oilChange",
      level:
        v.change.days < 0 ? "overdue" : v.change.days === 0 ? "today" : "soon",
      days: v.change.days,
      at: v.change.nextDate,
      title: {
        arName: `${v.plateNo} — ${v.change.item.arName}`,
        enName: `${v.plateNo} — ${v.change.item.enName}`,
      },
      customer: v.customer ?? null,
      phone: v.phone ?? v.customer?.phone ?? null,
      address: v.vehicleType ?? null,
      href: `/vehicles?q=${encodeURIComponent(v.plateNo)}`,
    }));
}
