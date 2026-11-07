import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule } from "@/lib/modules";

// ============================================================
// طاولات المطعم (لكل فرع) والحجز
// - الطاولة مشغولة في فترة = عليها طلب جديد (pending) أو مفتوح (open)
//   بيبدأ من ميعاد الوصول (الأونلاين) أو من وقت فتح الطاولة (الكاشير)
//   ومدته = مدة الجلسة من الإعدادات
// - الطاولة المفتوحة في الكاشير لسه ماتحاسبتش: مشغولة على الأقل لحد
//   دلوقتي + نص ساعة (مانعرفش هيقوموا إمتى)
// ============================================================

const MIN = 60_000;

const select = {
  id: true,
  branchId: true,
  name: true,
  seats: true,
  sortOrder: true,
  isActive: true,
  branch: { select: { id: true, arName: true, enName: true } },
};

export async function listTables() {
  await assertModule("restaurant");
  return prisma.restaurantTable.findMany({
    orderBy: [{ branchId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    select,
  });
}

export async function saveTable({ id, ...data }) {
  await assertModule("restaurant");
  try {
    return id
      ? await prisma.restaurantTable.update({
          where: { id },
          data,
          select: { id: true },
        })
      : await prisma.restaurantTable.create({ data, select: { id: true } });
  } catch (e) {
    if (e?.code === "P2002")
      throw new AppError("RestaurantTableExists", null, {
        name: "RestaurantTableExists",
      });
    if (e?.code === "P2025") throw new AppError("RestaurantTableNotFound");
    if (e?.code === "P2003") throw new AppError("BranchNotFound");
    throw e;
  }
}

export async function deleteTable(id) {
  await assertModule("restaurant");
  await prisma.restaurantTable.delete({ where: { id } }).catch((e) => {
    if (e?.code === "P2025") throw new AppError("RestaurantTableNotFound");
    throw e;
  });
  return { id };
}

export const tableMinutes = async () =>
  (
    await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { restaurantTableMinutes: true },
    })
  )?.restaurantTableMinutes ?? 90;

// فترات الطاولات المشغولة في الفرع: [{ tableId, start, end, dailyNo }]
async function busyWindows(branchId, minutes, excludeOrderId = null) {
  const now = Date.now();
  const rows = await prisma.restaurantOrder.findMany({
    where: {
      branchId,
      tableId: { not: null },
      status: { in: ["pending", "open"] },
      ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
    },
    select: {
      id: true,
      tableId: true,
      dailyNo: true,
      pickupAt: true,
      createdAt: true,
      status: true,
    },
  });
  return rows.map((o) => {
    const start = (o.pickupAt ?? o.createdAt).getTime();
    let end = start + minutes * MIN;
    // الطاولة المفتوحة (القاعدين عليها دلوقتي): لحد دلوقتي + نص ساعة على الأقل
    if (o.status === "open" && start <= now) end = Math.max(end, now + 30 * MIN);
    return { tableId: o.tableId, start, end, dailyNo: o.dailyNo };
  });
}

// الكاشير: طاولات الفرع + المشغولة دلوقتي (رقم الطلب اللي عليها)
export async function branchTables(branchId) {
  const [tables, minutes] = await Promise.all([
    prisma.restaurantTable.findMany({
      where: { branchId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true, seats: true },
    }),
    tableMinutes(),
  ]);
  if (!tables.length) return [];
  const now = Date.now();
  const busy = (await busyWindows(branchId, minutes)).filter(
    (w) => w.start <= now + 15 * MIN && w.end > now,
  );
  return tables.map((t) => {
    const w = busy.find((x) => x.tableId === t.id);
    return { ...t, busyNo: w?.dailyNo ?? null };
  });
}

// الأونلاين: الطاولات الفاضية في ميعاد معيّن وتكفي عدد الأفراد
export async function availableTables({ branchId, at, partySize }) {
  const minutes = await tableMinutes();
  const start = new Date(at).getTime();
  const end = start + minutes * MIN;
  const [tables, busy] = await Promise.all([
    prisma.restaurantTable.findMany({
      where: { branchId, isActive: true, seats: { gte: partySize } },
      orderBy: [{ seats: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true, seats: true },
    }),
    busyWindows(branchId, minutes),
  ]);
  const taken = new Set(
    busy.filter((w) => w.start < end && w.end > start).map((w) => w.tableId),
  );
  return tables.filter((t) => !taken.has(t.id));
}

// قبل حفظ الحجز: الطاولة لسه فاضية؟ (لو اتحجزت في نفس اللحظة)
export async function assertTableFree({ branchId, tableId, at, partySize }) {
  const free = await availableTables({ branchId, at, partySize });
  const t = free.find((x) => x.id === tableId);
  if (!t) throw new AppError("RestaurantTableTaken");
  return t;
}
