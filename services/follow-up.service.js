import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule, hasModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import {
  dayEnd,
  dayOf,
  dayStart,
  dayToDbDate,
  dbDateToDay,
  today,
} from "@/lib/dates";

// ============================================================
// المتابعة الدورية (وحدة followUps) - الفلاتر والتحلية
// - بتتعمل من فاتورة البيع: صنف عليه متابعة (followUpDays > 0) + "متابعة"
//   على السطر (اختياري، والعميل لازم يكون مسجّل)
// - الميعاد الجاي = آخر مرة + كل كام يوم
//   (آخر مرة = فاتورة الإنشاء / فاتورة صيانة اخترتها / "تمت المتابعة")
// - التأجيل بيغيّر الميعاد الجاي بس
// - حذف/تعديل الفاتورة بيرجّع اللي عملته، والمرتجع الكامل بيوقف المتابعة
// ============================================================

const DAY_MS = 86_400_000;
const addDays = (day, n) =>
  new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10);
const branchScope = (user) =>
  can(user, "allBranches.view") ? {} : { branchId: user.branch.id };
const clean = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

// ------------------------------------------------------------
// فاتورة البيع: إعدادات المتابعة لكل سطر (قبل الحفظ)
// items: سطور الفاتورة (productId + followUp)
// ------------------------------------------------------------
export async function prepareSaleFollowUps(items, customerId) {
  const wanted = items.some((it) => it.followUp);
  if (!wanted || !(await hasModule("followUps"))) return items.map(() => null);
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(items.map((i) => i.productId))] } },
    select: { id: true, arName: true, followUpDays: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return items.map((it, i) => {
    const f = it.followUp;
    const p = byId.get(it.productId);
    if (!f || !p || !(p.followUpDays > 0)) return null;
    if (!customerId)
      throw new AppError("FollowUpNeedsCustomer", null, {
        customerId: "FollowUpNeedsCustomer",
        [`items.${i}.followUp`]: "FollowUpNeedsCustomer",
      });
    return {
      id: f.id ?? null,
      deviceName: p.arName,
      productId: p.id,
      intervalDays: f.intervalDays,
      place: clean(f.place),
      address: clean(f.address),
      locationUrl: clean(f.locationUrl),
      phone: clean(f.phone),
      notes: clean(f.notes),
    };
  });
}

// المتابعات اللي هتتجدد بفاتورة الصيانة: لازم تكون شغالة ولنفس العميل
export async function prepareRenewals(ids, customerId) {
  const list = [...new Set(ids ?? [])];
  if (!list.length) return [];
  if (!customerId) throw new AppError("FollowUpNeedsCustomer");
  const found = await prisma.followUp.count({
    where: { id: { in: list }, customerId, status: "active" },
  });
  if (found !== list.length) throw new AppError("FollowUpNotFound");
  return list;
}

const configData = (c) => ({
  deviceName: c.deviceName,
  productId: c.productId,
  intervalDays: c.intervalDays,
  place: c.place,
  address: c.address,
  locationUrl: c.locationUrl,
  phone: c.phone,
  notes: c.notes,
});

// بعد حفظ الفاتورة: إنشاء المتابعات + تجديد المختار
// lines: نتيجة prepareSaleFollowUps (بنفس ترتيب itemIds)
export async function applySaleFollowUps(
  tx,
  {
    saleId,
    itemIds,
    lines,
    renewIds = [],
    logIds = [],
    customerId,
    branchId,
    date,
    user,
  },
) {
  const day = dayOf(date);
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i];
    if (!c) continue;
    await tx.followUp.create({
      data: {
        ...configData(c),
        customerId,
        branchId,
        originSaleId: saleId,
        saleItemId: itemIds[i],
        lastDate: dayToDbDate(day),
        nextDate: dayToDbDate(addDays(day, c.intervalDays)),
        createdById: user.id,
        logs: {
          create: {
            type: "created",
            date,
            saleId,
            nextDate: dayToDbDate(addDays(day, c.intervalDays)),
            userId: user.id,
          },
        },
      },
    });
  }
  for (const id of renewIds) {
    const f = await tx.followUp.findUnique({
      where: { id },
      select: { lastDate: true, nextDate: true, intervalDays: true },
    });
    if (!f) continue;
    const next = dayToDbDate(addDays(day, f.intervalDays));
    await tx.followUp.update({
      where: { id },
      data: { lastDate: dayToDbDate(day), nextDate: next },
    });
    await tx.followUpLog.create({
      data: {
        followUpId: id,
        type: "invoice",
        date,
        saleId,
        prevLastDate: f.lastDate,
        prevNextDate: f.nextDate,
        nextDate: next,
        userId: user.id,
      },
    });
  }
  // تسجيل في السجل فقط: صيانة اتعملت بالفاتورة والميعاد زي ما هو
  for (const id of logIds) {
    await tx.followUpLog.create({
      data: { followUpId: id, type: "service", date, saleId, userId: user.id },
    });
  }
}

// متابعة اتعملت بالفاتورة ومحصلش عليها حاجة بعد كده ← تتمسح
// وغير كده بتفضل بتاريخها (بس مش مربوطة بالفاتورة)
async function dropOrDetach(tx, f) {
  const activity = await tx.followUpLog.count({
    where: { followUpId: f.id, type: { not: "created" } },
  });
  if (!activity) await tx.followUp.delete({ where: { id: f.id } });
  else
    await tx.followUp.update({
      where: { id: f.id },
      data: { originSaleId: null, saleItemId: null },
    });
}

// تعديل الفاتورة: متابعات السطور تتحدث / تتعمل / تتشال
export async function syncSaleFollowUps(
  tx,
  { saleId, itemIds, lines, customerId, date, user },
) {
  const existing = await tx.followUp.findMany({
    where: { originSaleId: saleId },
    select: {
      id: true,
      lastDate: true,
      intervalDays: true,
      _count: { select: { logs: { where: { type: { not: "created" } } } } },
    },
  });
  const byId = new Map(existing.map((f) => [f.id, f]));
  const kept = new Set();
  const day = dayOf(date);
  const fresh = lines.map(() => null);
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i];
    if (!c) continue;
    const f = c.id ? byId.get(c.id) : null;
    if (!f) {
      fresh[i] = c;
      continue;
    }
    kept.add(f.id);
    // لسه ما اتعملش عليها حاجة: آخر مرة = تاريخ الفاتورة (لو اتغير)
    const untouched = f._count.logs === 0;
    const last = untouched ? day : dbDateToDay(f.lastDate);
    await tx.followUp.update({
      where: { id: f.id },
      data: {
        ...configData(c),
        customerId,
        saleItemId: itemIds[i],
        lastDate: dayToDbDate(last),
        nextDate: dayToDbDate(addDays(last, c.intervalDays)),
      },
    });
  }
  for (const f of existing) if (!kept.has(f.id)) await dropOrDetach(tx, f);
  await applySaleFollowUps(tx, {
    saleId,
    itemIds,
    lines: fresh,
    customerId,
    branchId: (
      await tx.sale.findUnique({
        where: { id: saleId },
        select: { branchId: true },
      })
    ).branchId,
    date,
    user,
  });
}

// تجديدات اتعملت بفاتورة: الميعاد يرجع زي ما كان (لو التجديد ده آخر حاجة)
async function revertSaleLogs(tx, saleId, types) {
  const logs = await tx.followUpLog.findMany({
    where: { saleId, type: { in: types } },
    select: {
      id: true,
      type: true,
      followUpId: true,
      prevLastDate: true,
      prevNextDate: true,
    },
  });
  for (const l of logs) {
    const later = await tx.followUpLog.count({
      where: { followUpId: l.followUpId, id: { gt: l.id } },
    });
    // "تسجيل فقط" مغيّرش الميعاد: مفيش حاجة ترجع
    if (!later && l.type !== "service") {
      await tx.followUp.update({
        where: { id: l.followUpId },
        data:
          l.type === "stopped"
            ? { status: "active" }
            : {
                ...(l.prevLastDate ? { lastDate: l.prevLastDate } : {}),
                ...(l.prevNextDate ? { nextDate: l.prevNextDate } : {}),
              },
      });
    }
    await tx.followUpLog.delete({ where: { id: l.id } });
  }
}

// حذف فاتورة البيع
export async function deleteSaleFollowUps(tx, saleId) {
  await revertSaleLogs(tx, saleId, ["invoice", "service"]);
  const origin = await tx.followUp.findMany({
    where: { originSaleId: saleId },
    select: { id: true },
  });
  for (const f of origin) await dropOrDetach(tx, f);
}

// مرتجع كامل لسطر عليه متابعة ← المتابعة تقف (وحذف المرتجع يرجّعها)
// lines: [{ itemId, fullyReturned }]
export async function stopForReturn(tx, { returnId, lines, date, user }) {
  const ids = lines.filter((l) => l.fullyReturned).map((l) => l.itemId);
  if (!ids.length) return;
  const list = await tx.followUp.findMany({
    where: { saleItemId: { in: ids }, status: "active" },
    select: { id: true },
  });
  for (const f of list) {
    await tx.followUp.update({
      where: { id: f.id },
      data: { status: "stopped" },
    });
    await tx.followUpLog.create({
      data: {
        followUpId: f.id,
        type: "stopped",
        date,
        saleId: returnId,
        userId: user.id,
      },
    });
  }
}

export async function resumeAfterReturnDelete(tx, returnId) {
  await revertSaleLogs(tx, returnId, ["stopped"]);
}

// ============================================================
// شاشة المتابعات
// ============================================================
const nameSelect = { select: { id: true, arName: true, enName: true } };

// المستوى: متأخر / النهارده / قريب (خلال soonDays) / بعدين
const levelOf = (next, todayDay, soonDays) =>
  next < todayDay
    ? "overdue"
    : next === todayDay
      ? "today"
      : next <= addDays(todayDay, soonDays)
        ? "soon"
        : "later";

export const FOLLOWUP_SOON_DAYS = 7;

export async function listFollowUps(
  { filter = "due", q = "", customerId },
  user,
) {
  await assertModule("followUps");
  const todayDay = today();
  const text = q.trim();
  const where = {
    ...branchScope(user),
    ...(customerId ? { customerId } : {}),
    ...(text
      ? {
          OR: [
            { deviceName: { contains: text } },
            { place: { contains: text } },
            { address: { contains: text } },
            { phone: { contains: text } },
            { customer: { arName: { contains: text } } },
            { customer: { enName: { contains: text } } },
            { customer: { phone: { contains: text } } },
          ],
        }
      : {}),
  };
  const rows = await prisma.followUp.findMany({
    where:
      filter === "stopped"
        ? { ...where, status: "stopped" }
        : { ...where, status: "active" },
    orderBy: [{ nextDate: "asc" }, { id: "asc" }],
    take: 1000,
    select: {
      id: true,
      deviceName: true,
      intervalDays: true,
      place: true,
      address: true,
      locationUrl: true,
      phone: true,
      notes: true,
      lastDate: true,
      nextDate: true,
      status: true,
      customer: {
        select: {
          id: true,
          code: true,
          arName: true,
          enName: true,
          phone: true,
        },
      },
      originSale: { select: { id: true, number: true } },
      branch: nameSelect,
      // عدد مرات الصيانة: فواتير صيانة (تجديد أو تسجيل) + "تمت المتابعة"
      _count: {
        select: {
          logs: { where: { type: { in: ["invoice", "service", "done"] } } },
        },
      },
    },
  });
  const all = rows.map((r) => {
    const next = dbDateToDay(r.nextDate);
    return {
      ...r,
      serviceCount: r._count.logs,
      _count: undefined,
      lastDate: dbDateToDay(r.lastDate),
      nextDate: next,
      days: Math.round((Date.parse(next) - Date.parse(todayDay)) / DAY_MS),
      level:
        r.status === "stopped"
          ? "stopped"
          : levelOf(next, todayDay, FOLLOWUP_SOON_DAYS),
    };
  });
  const counts = { overdue: 0, today: 0, soon: 0, later: 0 };
  for (const r of all) if (counts[r.level] != null) counts[r.level]++;
  counts.due = counts.overdue + counts.today + counts.soon;
  counts.all = all.length;
  const shown =
    filter === "due"
      ? all.filter((r) => r.level !== "later")
      : ["overdue", "today", "soon", "later"].includes(filter)
        ? all.filter((r) => r.level === filter)
        : all;
  return { rows: shown, counts };
}

async function findOwn(id, user) {
  await assertModule("followUps");
  const f = await prisma.followUp.findFirst({
    where: { id, ...branchScope(user) },
    select: {
      id: true,
      status: true,
      lastDate: true,
      nextDate: true,
      intervalDays: true,
    },
  });
  if (!f) throw new AppError("FollowUpNotFound");
  return f;
}

// تمت المتابعة (من غير فاتورة): آخر مرة = اليوم المختار
export async function markFollowUpDone({ id, date, note }, user) {
  const f = await findOwn(id, user);
  if (f.status !== "active") throw new AppError("FollowUpStopped");
  const day = date ?? today();
  if (day > today())
    throw new AppError("FutureDate", null, { date: "FutureDate" });
  const next = dayToDbDate(addDays(day, f.intervalDays));
  await prisma.$transaction([
    prisma.followUp.update({
      where: { id },
      data: { lastDate: dayToDbDate(day), nextDate: next },
    }),
    prisma.followUpLog.create({
      data: {
        followUpId: id,
        type: "done",
        date: new Date(),
        note: clean(note),
        prevLastDate: f.lastDate,
        prevNextDate: f.nextDate,
        nextDate: next,
        userId: user.id,
      },
    }),
  ]);
  return { id };
}

// تأجيل: الميعاد الجاي بس
export async function postponeFollowUp({ id, date, note }, user) {
  const f = await findOwn(id, user);
  if (f.status !== "active") throw new AppError("FollowUpStopped");
  await prisma.$transaction([
    prisma.followUp.update({
      where: { id },
      data: { nextDate: dayToDbDate(date) },
    }),
    prisma.followUpLog.create({
      data: {
        followUpId: id,
        type: "postponed",
        date: new Date(),
        note: clean(note),
        prevNextDate: f.nextDate,
        nextDate: dayToDbDate(date),
        userId: user.id,
      },
    }),
  ]);
  return { id };
}

// إيقاف / استئناف (الاستئناف: الميعاد من آخر مرة، ولو فات ← النهارده)
export async function setFollowUpStatus({ id, active, note }, user) {
  const f = await findOwn(id, user);
  if ((f.status === "active") === active) return { id };
  let next = f.nextDate;
  if (active) {
    const due = addDays(dbDateToDay(f.lastDate), f.intervalDays);
    next = dayToDbDate(due < today() ? today() : due);
  }
  await prisma.$transaction([
    prisma.followUp.update({
      where: { id },
      data: { status: active ? "active" : "stopped", nextDate: next },
    }),
    prisma.followUpLog.create({
      data: {
        followUpId: id,
        type: active ? "resumed" : "stopped",
        date: new Date(),
        note: clean(note),
        prevNextDate: f.nextDate,
        nextDate: next,
        userId: user.id,
      },
    }),
  ]);
  return { id };
}

// تعديل بيانات المتابعة (كل كام يوم، المكان، اللوكيشن، الجوال...)
export async function updateFollowUp({ id, ...data }, user) {
  const f = await findOwn(id, user);
  const changed = data.intervalDays !== f.intervalDays;
  const next = changed
    ? dayToDbDate(addDays(dbDateToDay(f.lastDate), data.intervalDays))
    : f.nextDate;
  await prisma.$transaction([
    prisma.followUp.update({
      where: { id },
      data: {
        intervalDays: data.intervalDays,
        place: clean(data.place),
        address: clean(data.address),
        locationUrl: clean(data.locationUrl),
        phone: clean(data.phone),
        notes: clean(data.notes),
        nextDate: next,
      },
    }),
    prisma.followUpLog.create({
      data: {
        followUpId: id,
        type: "edited",
        date: new Date(),
        prevNextDate: f.nextDate,
        nextDate: next,
        userId: user.id,
      },
    }),
  ]);
  return { id };
}

// سجل المتابعة
export async function followUpLogs(id, user) {
  await findOwn(id, user);
  const logs = await prisma.followUpLog.findMany({
    where: { followUpId: id },
    orderBy: { id: "desc" },
    select: {
      id: true,
      type: true,
      date: true,
      note: true,
      nextDate: true,
      sale: { select: { id: true, type: true, number: true } },
      user: { select: { arFullname: true, enFullname: true } },
    },
  });
  return logs.map((l) => ({ ...l, nextDate: dbDateToDay(l.nextDate) }));
}

// متابعات العميل الشغالة (نافذة "هل تريد تجديد متابعة؟" وقت حفظ الفاتورة)
export async function customerActiveFollowUps(customerId) {
  if (!(await hasModule("followUps"))) return [];
  const rows = await prisma.followUp.findMany({
    where: { customerId, status: "active" },
    orderBy: { nextDate: "asc" },
    select: {
      id: true,
      deviceName: true,
      place: true,
      intervalDays: true,
      nextDate: true,
    },
  });
  return rows.map((r) => ({ ...r, nextDate: dbDateToDay(r.nextDate) }));
}

// فاتورة صيانة من شاشة المتابعات (?followUp=ID): العميل والمتابعة
export async function getFollowUpForSale(id, user) {
  const f = await prisma.followUp.findFirst({
    where: { id, status: "active", ...branchScope(user) },
    select: { id: true, customerId: true },
  });
  return f;
}

// ------------------------------------------------------------
// الجرس: المتأخر + اللي جاي خلال soonDays
// ------------------------------------------------------------
export async function dueFollowUps(user, soonDays = FOLLOWUP_SOON_DAYS) {
  const todayDay = today();
  const rows = await prisma.followUp.findMany({
    where: {
      ...branchScope(user),
      status: "active",
      nextDate: { lte: dayToDbDate(addDays(todayDay, soonDays)) },
    },
    orderBy: { nextDate: "asc" },
    take: 60,
    select: {
      id: true,
      deviceName: true,
      place: true,
      address: true,
      locationUrl: true,
      phone: true,
      nextDate: true,
      customer: { select: { arName: true, enName: true, phone: true } },
    },
  });
  return rows.map((r) => {
    const next = dbDateToDay(r.nextDate);
    const days = Math.round((Date.parse(next) - Date.parse(todayDay)) / DAY_MS);
    return {
      key: `followup-${r.id}`,
      kind: "followUp",
      level: days < 0 ? "overdue" : days === 0 ? "today" : "soon",
      days,
      at: next,
      title: { arName: r.deviceName, enName: r.deviceName },
      customer: r.customer,
      phone: r.phone ?? r.customer?.phone ?? null,
      address: [r.place, r.address].filter(Boolean).join(" - ") || null,
      href: `/follow-ups?focus=${r.id}`,
    };
  });
}

// ============================================================
// تقرير المتابعات في فترة (شهر / من تاريخ لتاريخ)
// كل جهاز بيظهر مرة واحدة:
// - done: اتعملّه صيانة في الفترة (فاتورة صيانة أو "تمت المتابعة")
// - overdue: ميعاده في الفترة وفات ولسه ما اتعملش
// - pending: ميعاده في الفترة ولسه ما جاش
// status: all | done | overdue | pending
// من غير from/to = كل المتابعات الشغالة (أي ميعاد)
// months: المتابعة كل كام شهر (كل 3 شهور = 90 يوم تقريباً)
// ============================================================
const SERVICE_LOGS = ["invoice", "service", "done"];
// المدة بالشهور (90 يوم = 3 شهور، 365 = 12)
const monthsOf = (days) => Math.max(1, Math.round(days / 30.4));

export async function followUpReport(
  { from, to, status = "all", branchId, months },
  user,
) {
  await assertModule("followUps");
  const anyDate = !from || !to;
  if (!anyDate && from > to) [from, to] = [to, from];
  const todayDay = today();
  const scope = can(user, "allBranches.view")
    ? branchId
      ? { branchId }
      : {}
    : { branchId: user.branch.id };
  const select = {
    id: true,
    deviceName: true,
    intervalDays: true,
    place: true,
    address: true,
    phone: true,
    lastDate: true,
    nextDate: true,
    status: true,
    customer: { select: { id: true, arName: true, enName: true, phone: true } },
    branch: nameSelect,
    // كل مرات الصيانة (من الأول)
    _count: { select: { logs: { where: { type: { in: SERVICE_LOGS } } } } },
  };

  const [due, logs] = await Promise.all([
    // الأجهزة اللي ميعادها في الفترة (الشغالة بس)
    prisma.followUp.findMany({
      where: {
        ...scope,
        status: "active",
        ...(anyDate
          ? {}
          : { nextDate: { gte: dayToDbDate(from), lte: dayToDbDate(to) } }),
      },
      orderBy: [{ nextDate: "asc" }, { id: "asc" }],
      take: 5000,
      select,
    }),
    // الصيانات اللي اتعملت في الفترة
    anyDate
      ? Promise.resolve([])
      : prisma.followUpLog.findMany({
          where: {
            type: { in: SERVICE_LOGS },
            date: { gte: dayStart(from), lte: dayEnd(to) },
            followUp: scope,
          },
          orderBy: { date: "asc" },
          take: 20000,
          select: {
            date: true,
            followUpId: true,
            sale: { select: { id: true, number: true } },
            followUp: { select },
          },
        }),
  ]);

  const byId = new Map();
  for (const l of logs) {
    const f = l.followUp;
    const row = byId.get(f.id) ?? { ...f, state: "done", visits: 0 };
    row.visits += 1;
    row.doneDate = dayOf(l.date);
    if (l.sale) row.sale = l.sale;
    byId.set(f.id, row);
  }
  for (const f of due) {
    if (byId.has(f.id)) continue;
    const next = dbDateToDay(f.nextDate);
    byId.set(f.id, {
      ...f,
      state: next < todayDay ? "overdue" : "pending",
      visits: 0,
    });
  }

  const all = [...byId.values()]
    .filter((r) => !months || monthsOf(r.intervalDays) === months)
    .map(({ _count, ...r }) => {
      const next = dbDateToDay(r.nextDate);
      return {
        ...r,
        months: monthsOf(r.intervalDays),
        // من غير فترة: كل مرات الصيانة
        visits: anyDate ? _count.logs : r.visits,
        lastDate: dbDateToDay(r.lastDate),
        nextDate: next,
        days: Math.round((Date.parse(next) - Date.parse(todayDay)) / DAY_MS),
      };
    });
  // الترتيب: المتأخر ← اللي جاي ← اللي اتعمل، وجوه كل واحد بالتاريخ
  const ORDER = { overdue: 0, pending: 1, done: 2 };
  all.sort(
    (a, b) =>
      ORDER[a.state] - ORDER[b.state] ||
      (a.state === "done"
        ? a.doneDate.localeCompare(b.doneDate)
        : a.nextDate.localeCompare(b.nextDate)) ||
      a.id - b.id,
  );

  const summary = { devices: all.length, overdue: 0, pending: 0, done: 0 };
  let visits = 0;
  for (const r of all) {
    summary[r.state]++;
    visits += r.visits;
  }
  summary.visits = visits;
  summary.customers = new Set(all.map((r) => r.customer?.id)).size;

  const rows = status === "all" ? all : all.filter((r) => r.state === status);
  return {
    rows,
    summary,
    // عدد العملاء في اللي ظاهر (بعد فلتر الحالة)
    shownCustomers: new Set(rows.map((r) => r.customer?.id)).size,
  };
}
