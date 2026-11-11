import "server-only";
import { docNumberWhere, nextBranchNumber } from "./sequence.service";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/transaction";
import { AppError } from "@/lib/errors";
import { assertModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { dayToDbDate, today } from "@/lib/dates";

// ============================================================
// عقود الصيانة الدورية (وحدة maintenanceContracts)
// - العقد: جهاز عند عميل، زيارة كل N شهر من البداية لحد النهاية
// - الزيارات بتتولد مع العقد (أول زيارة بعد أول فترة)
// - الزيارة: تتنفذ (فني + ملاحظة) أو تتأجل لتاريخ تاني أو تتلغى
// - الفلوس: قيمة العقد للعلم بس، والتحصيل بفاتورة عادية
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const day = (d) => (d ? d.toISOString().slice(0, 10) : null);
const branchScope = (user) =>
  can(user, "allBranches.view") ? {} : { branchId: user.branch.id };

// إضافة شهور ليوم "YYYY-MM-DD" (آخر يوم في الشهر لو اليوم مش موجود)
function addMonths(dayStr, months) {
  const [y, m, d] = dayStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

// مواعيد الزيارات: كل interval شهر بعد البداية لحد النهاية (حد أقصى 240)
export function visitSchedule(startDate, endDate, intervalMonths) {
  const out = [];
  for (let i = 1; i <= 240; i++) {
    const d = addMonths(startDate, intervalMonths * i);
    if (d > endDate) break;
    out.push(d);
  }
  return out;
}


async function assertRefs(db, { customerId, technicianId, productId }) {
  const [c, t, p] = await Promise.all([
    db.customer.findUnique({ where: { id: customerId }, select: { id: true } }),
    technicianId
      ? db.technician.findUnique({
          where: { id: technicianId },
          select: { id: true },
        })
      : true,
    productId
      ? db.product.findUnique({
          where: { id: productId },
          select: { id: true },
        })
      : true,
  ]);
  if (!c) throw new AppError("CustomerNotFound");
  if (!t) throw new AppError("TechnicianNotFound");
  if (!p) throw new AppError("ProductNotFound");
}

// ------------------------------------------------------------
// إضافة عقد + جدول زياراته
// ------------------------------------------------------------
export async function createContract(data, user) {
  await assertModule("maintenanceContracts");
  if (data.endDate <= data.startDate)
    throw new AppError("ContractEndBeforeStart", null, {
      endDate: "ContractEndBeforeStart",
    });
  const visits = visitSchedule(
    data.startDate,
    data.endDate,
    data.intervalMonths,
  );
  if (!visits.length)
    throw new AppError("ContractNoVisits", null, {
      intervalMonths: "ContractNoVisits",
    });
  await assertRefs(prisma, data);
  return runTx(async (tx) => {
    const { number, docCode } = await nextBranchNumber(
      tx,
      "contract",
      user.branch.id,
    );
    return tx.maintenanceContract.create({
      data: {
        number,
        docCode,
        branchId: user.branch.id,
        customerId: data.customerId,
        productId: data.productId ?? null,
        deviceName: data.deviceName,
        serialText: data.serialText ?? null,
        address: data.address ?? null,
        intervalMonths: data.intervalMonths,
        startDate: dayToDbDate(data.startDate),
        endDate: dayToDbDate(data.endDate),
        amount: data.amount ?? null,
        technicianId: data.technicianId ?? null,
        notes: data.notes ?? null,
        createdById: user.id,
        visits: {
          create: visits.map((d) => ({ dueDate: dayToDbDate(d) })),
        },
      },
      select: { id: true, number: true, docCode: true },
    });
  });
}

// الزيارات الجديدة بعد تعديل المدة/الفترة: الجدول الجديد بعد آخر زيارة
// اتعملت أو اتخطت (اللي اتعمل بيفضل زي ما هو كتاريخ)
export function rescheduledVisits(start, end, every, kept) {
  const last = kept.reduce((m, d) => (d > m ? d : m), "");
  return visitSchedule(start, end, every).filter((d) => d > last);
}

// تعديل بيانات العقد، ولو المدة أو الفترة اتغيرت: الزيارات اللي لسه
// ما اتعملتش بتتشال وتتجدول من جديد
export async function updateContract({ id, ...data }, user) {
  await assertModule("maintenanceContracts");
  const c = await prisma.maintenanceContract.findFirst({
    where: { id, ...branchScope(user) },
    select: {
      id: true,
      status: true,
      customerId: true,
      startDate: true,
      endDate: true,
      intervalMonths: true,
      visits: { select: { status: true, dueDate: true } },
    },
  });
  if (!c) throw new AppError("NotFound");
  if (c.status === "cancelled") throw new AppError("ContractCancelled");
  if (data.endDate <= data.startDate)
    throw new AppError("ContractEndBeforeStart", null, {
      endDate: "ContractEndBeforeStart",
    });
  await assertRefs(prisma, { ...data, customerId: c.customerId });

  const scheduleChanged =
    data.startDate !== day(c.startDate) ||
    data.endDate !== day(c.endDate) ||
    data.intervalMonths !== c.intervalMonths;
  let fresh = [];
  if (scheduleChanged) {
    const kept = c.visits
      .filter((v) => v.status !== "pending")
      .map((v) => day(v.dueDate));
    fresh = rescheduledVisits(
      data.startDate,
      data.endDate,
      data.intervalMonths,
      kept,
    );
    if (!kept.length && !fresh.length)
      throw new AppError("ContractNoVisits", null, {
        intervalMonths: "ContractNoVisits",
      });
  }

  await runTx(async (tx) => {
    await tx.maintenanceContract.update({
      where: { id },
      data: {
        deviceName: data.deviceName,
        serialText: data.serialText ?? null,
        address: data.address ?? null,
        amount: data.amount ?? null,
        technicianId: data.technicianId ?? null,
        notes: data.notes ?? null,
        intervalMonths: data.intervalMonths,
        startDate: dayToDbDate(data.startDate),
        endDate: dayToDbDate(data.endDate),
      },
    });
    if (scheduleChanged) {
      await tx.maintenanceVisit.deleteMany({
        where: { contractId: id, status: "pending" },
      });
      if (fresh.length)
        await tx.maintenanceVisit.createMany({
          data: fresh.map((d) => ({ contractId: id, dueDate: dayToDbDate(d) })),
        });
    }
  });
  return { id };
}

// إلغاء العقد: الزيارات اللي لسه ما اتعملتش بتتلغي
export async function cancelContract(id, user) {
  await assertModule("maintenanceContracts");
  const c = await prisma.maintenanceContract.findFirst({
    where: { id, ...branchScope(user) },
    select: { id: true, status: true },
  });
  if (!c) throw new AppError("NotFound");
  if (c.status === "cancelled") return { id };
  await prisma.$transaction([
    prisma.maintenanceContract.update({
      where: { id },
      data: { status: "cancelled" },
    }),
    prisma.maintenanceVisit.updateMany({
      where: { contractId: id, status: "pending" },
      data: { status: "skipped" },
    }),
  ]);
  return { id };
}

// ------------------------------------------------------------
// الزيارة: done اتنفذت | skipped اتلغت | pending + dueDate = تأجيل
// ------------------------------------------------------------
export async function updateVisit(
  { id, status, dueDate, technicianId, note },
  user,
) {
  await assertModule("maintenanceContracts");
  const v = await prisma.maintenanceVisit.findFirst({
    where: { id, contract: branchScope(user) },
    select: { id: true, contract: { select: { status: true } } },
  });
  if (!v) throw new AppError("NotFound");
  if (v.contract.status === "cancelled")
    throw new AppError("ContractCancelled");
  if (technicianId) {
    const t = await prisma.technician.findUnique({
      where: { id: technicianId },
      select: { id: true },
    });
    if (!t) throw new AppError("TechnicianNotFound");
  }
  await prisma.maintenanceVisit.update({
    where: { id },
    data: {
      ...(status
        ? { status, doneAt: status === "done" ? new Date() : null }
        : {}),
      ...(dueDate ? { dueDate: dayToDbDate(dueDate) } : {}),
      ...(technicianId !== undefined ? { technicianId } : {}),
      ...(note !== undefined ? { note } : {}),
    },
  });
  return { id };
}

// ------------------------------------------------------------
// القراءة
// ------------------------------------------------------------
const nameSelect = { select: { id: true, arName: true, enName: true } };

// الحالة الفعلية: العقد الساري اللي عدّى تاريخ نهايته = منتهي
const effectiveStatus = (c) =>
  c.status === "active" && day(c.endDate) < today() ? "ended" : c.status;

export async function listContracts({ status = "active", q = "" }, user) {
  await assertModule("maintenanceContracts");
  const text = q.trim();
  // رقم المستند: في فرع الرمز أو فرع المستخدم
  const ref = text ? await docNumberWhere(text, user) : null;
  const todayDb = dayToDbDate(today());
  const base = {
    ...branchScope(user),
    ...(text
      ? {
          OR: [
            ...(ref ? [ref] : []),
            { deviceName: { contains: text } },
            { serialText: { contains: text } },
            { customer: { arName: { contains: text } } },
            { customer: { phone: { contains: text } } },
          ],
        }
      : {}),
  };
  const byStatus = {
    active: { status: "active", endDate: { gte: todayDb } },
    ended: { status: "active", endDate: { lt: todayDb } },
    cancelled: { status: "cancelled" },
    all: {},
  };
  const [rows, ...nums] = await Promise.all([
    prisma.maintenanceContract.findMany({
      where: { ...base, ...byStatus[status] },
      orderBy: { id: "desc" },
      take: 500,
      select: {
        id: true,
        number: true, docCode: true,
        deviceName: true,
        serialText: true,
        intervalMonths: true,
        startDate: true,
        endDate: true,
        amount: true,
        status: true,
        customer: { select: { arName: true, enName: true, phone: true } },
        technician: nameSelect,
        visits: {
          where: { status: "pending" },
          orderBy: { dueDate: "asc" },
          take: 1,
          select: { dueDate: true },
        },
        _count: { select: { visits: true } },
      },
    }),
    // عدد كل حالة (أزرار الفلتر) بنفس البحث
    ...Object.values(byStatus).map((w) =>
      prisma.maintenanceContract.count({ where: { ...base, ...w } }),
    ),
  ]);
  return {
    counts: Object.fromEntries(
      Object.keys(byStatus).map((k, i) => [k, nums[i]]),
    ),
    rows: rows.map((c) => ({
      ...c,
      status: effectiveStatus(c),
      startDate: day(c.startDate),
      endDate: day(c.endDate),
      amount: c.amount == null ? null : n(c.amount),
      nextVisit: day(c.visits[0]?.dueDate),
      visits: undefined,
    })),
  };
}

export async function getContract(id, user) {
  await assertModule("maintenanceContracts");
  const c = await prisma.maintenanceContract.findFirst({
    where: { id, ...branchScope(user) },
    include: {
      branch: nameSelect,
      customer: {
        select: {
          id: true,
          code: true,
          arName: true,
          enName: true,
          phone: true,
        },
      },
      product: { select: { id: true, code: true, arName: true, enName: true } },
      technician: nameSelect,
      createdBy: { select: { arFullname: true, enFullname: true } },
      visits: {
        orderBy: { dueDate: "asc" },
        include: { technician: nameSelect },
      },
    },
  });
  if (!c) return null;
  return {
    ...c,
    status: effectiveStatus(c),
    startDate: day(c.startDate),
    endDate: day(c.endDate),
    amount: c.amount == null ? null : n(c.amount),
    visits: c.visits.map((v) => ({ ...v, dueDate: day(v.dueDate) })),
  };
}

// الصفحة الرئيسية: زيارات خلال 7 أيام + المتأخرة
export async function visitCounters(user) {
  const now = dayToDbDate(today());
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  const base = {
    status: "pending",
    contract: { status: "active", ...branchScope(user) },
  };
  const [overdue, upcoming] = await Promise.all([
    prisma.maintenanceVisit.count({ where: { ...base, dueDate: { lt: now } } }),
    prisma.maintenanceVisit.count({
      where: { ...base, dueDate: { gte: now, lte: soon } },
    }),
  ]);
  return { overdue, upcoming };
}
