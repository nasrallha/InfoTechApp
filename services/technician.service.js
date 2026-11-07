import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule, hasModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { dayEnd, dayStart, dayToDbDate, today } from "@/lib/dates";
import { bizRange } from "@/lib/business-day";
import { getDayStartHour } from "@/lib/business-day-server";
import { getStaffTitle } from "@/lib/staff-title";

// ============================================================
// الفنيون (وحدة technicians)
// - الفني بيتحدد على سطر الخدمة في الفاتورة (تركيب/صيانة) ومعاه الموعد والعنوان
// - المواعيد: سطور الفواتير + زيارات عقود الصيانة في شاشة واحدة
// - العمولة: نسبة الفني × صافي سطور الخدمات اللي نفذها (البيع ناقص المرتجع)
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const branchScope = (user) =>
  can(user, "allBranches.view") ? {} : { branchId: user.branch.id };

const nameSel = { select: { id: true, arName: true, enName: true } };
const toDTO = (t) => ({
  ...t,
  commissionRate: n(t.commissionRate),
  productRate: n(t.productRate),
  ...(t.rates
    ? { rates: t.rates.map((r) => ({ ...r, value: n(r.value) })) }
    : {}),
});

export async function getTechnicians({ activeOnly = false } = {}) {
  await assertModule("technicians");
  const rows = await prisma.technician.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: { id: "asc" },
    include: {
      _count: { select: { saleItems: true, contracts: true, visits: true } },
      rates: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          categoryId: true,
          productId: true,
          rateType: true,
          value: true,
          category: nameSel,
          product: {
            select: { id: true, code: true, arName: true, enName: true },
          },
        },
      },
    },
  });
  return rows.map(toDTO);
}

// الاستثناءات: نفس القسم/الصنف مرة واحدة (الأخير هو اللي بيتحفظ)
function cleanRates(rates) {
  const seen = new Map();
  for (const r of rates ?? []) {
    const key = r.productId ? `p${r.productId}` : `c${r.categoryId}`;
    seen.set(key, {
      categoryId: r.productId ? null : r.categoryId,
      productId: r.productId ?? null,
      rateType: r.rateType,
      value: r.value,
    });
  }
  return [...seen.values()];
}

// للشاشات اللي الفني فيها اختياري (العقود والمواعيد): فاضية لو الوحدة مقفولة
export async function techniciansIfEnabled() {
  if (!(await hasModule("technicians"))) return [];
  return getTechnicians({ activeOnly: true });
}

export async function createTechnician({ rates, ...data }) {
  await assertModule("technicians");
  return prisma.technician.create({
    data: {
      ...data,
      ...(rates ? { rates: { create: cleanRates(rates) } } : {}),
    },
    select: { id: true },
  });
}

// rates موجودة ← بتتبدل كلها (من غير rates: زي ما هي)
export async function updateTechnician({ id, rates, ...data }) {
  await assertModule("technicians");
  await prisma.$transaction(async (tx) => {
    await tx.technician.update({ where: { id }, data });
    if (rates) {
      await tx.technicianRate.deleteMany({ where: { technicianId: id } });
      const rows = cleanRates(rates);
      if (rows.length)
        await tx.technicianRate.createMany({
          data: rows.map((r) => ({ ...r, technicianId: id })),
        });
    }
  });
  return { id };
}

// الفني اللي عليه شغل بيتوقف بس (عشان تاريخه وعمولاته)
export async function deleteTechnician(id) {
  await assertModule("technicians");
  const t = await prisma.technician.findUnique({
    where: { id },
    include: {
      _count: { select: { saleItems: true, contracts: true, visits: true } },
    },
  });
  if (!t) throw new AppError("NotFound");
  if (t._count.saleItems + t._count.contracts + t._count.visits > 0)
    throw new AppError("TechnicianInUse");
  await prisma.technician.delete({ where: { id } });
  return { id };
}

// ------------------------------------------------------------
// الفاتورة: الفني والموعد على سطور الخدمات
// items: سطور الفاتورة بعد التحقق (product فيه isService)
// بيرجع لكل سطر حقول الموعد (أو {} لو مفيش)
// ------------------------------------------------------------
export async function prepareSaleJobs(items) {
  const on = await hasModule("technicians");
  // الكوافير / الحلاق / المساج: مقدم الخدمة على السطر من غير "موعد تنفيذ"
  // (إلا لو اتحدد ميعاد أو عنوان) - الفني: زي الأول
  const staffOnly = on && (await getStaffTitle()).title !== "technician";
  const ids = [
    ...new Set(
      items
        .map((it) => it.job?.technicianId)
        .filter((x) => Number.isInteger(x)),
    ),
  ];
  const techs =
    on && ids.length
      ? await prisma.technician.findMany({
          where: { id: { in: ids } },
          select: { id: true },
        })
      : [];
  const known = new Set(techs.map((t) => t.id));
  return items.map((it, i) => {
    const job = it.job;
    if (!on || !job) return {};
    if (job.technicianId && !known.has(job.technicianId))
      throw new AppError("TechnicianNotFound", null, {
        [`items.${i}.job`]: "TechnicianNotFound",
      });
    // صنف عادي (مستحضرات...): اللي باعه بس (عشان عمولة البيع)
    if (!it.product.isService)
      return job.technicianId ? { technicianId: job.technicianId } : {};
    const at = job.at ? new Date(job.at) : null;
    if (at && Number.isNaN(at.getTime())) throw new AppError("InvalidDate");
    if (!job.technicianId && !at) return {};
    // مقدم الخدمة بس (الخدمة اتعملت في المحل): مش موعد
    if (staffOnly && !at && !job.address)
      return { technicianId: job.technicianId };
    return {
      technicianId: job.technicianId ?? null,
      jobAt: at,
      jobAddress: job.address ?? null,
      jobNote: job.note ?? null,
      jobStatus: job.status === "done" ? "done" : "pending",
      jobDoneAt:
        job.status === "done"
          ? job.doneAt
            ? new Date(job.doneAt)
            : new Date()
          : null,
    };
  });
}

// ------------------------------------------------------------
// المواعيد: سطور الفواتير + زيارات العقود
// ------------------------------------------------------------
// كل الحالات مرة واحدة (الشاشة بتفلتر وتعد): المستني من غير بداية للفترة
// عشان المتأخر يظهر، والمنفذ/الملغي جوه الفترة
export async function listJobs({ from, to, technicianId, type = "all" }, user) {
  const [techOn, contractsOn] = await Promise.all([
    hasModule("technicians"),
    hasModule("maintenanceContracts"),
  ]);
  if (!techOn && !contractsOn) throw new AppError("ModuleDisabled");
  const start = from ? dayStart(from) : undefined;
  const end = to ? dayEnd(to) : undefined;
  const rows = [];

  if (techOn && type !== "visit") {
    const items = await prisma.saleItem.findMany({
      where: {
        jobStatus: { not: null },
        sale: { type: "sale", ...branchScope(user) },
        ...(technicianId ? { technicianId } : {}),
        ...(start || end
          ? {
              OR: [
                {
                  jobStatus: "pending",
                  OR: [
                    ...(end ? [{ jobAt: { lte: end } }] : []),
                    { jobAt: null },
                  ],
                },
                {
                  jobStatus: { not: "pending" },
                  OR: [
                    {
                      jobAt: {
                        ...(start ? { gte: start } : {}),
                        ...(end ? { lte: end } : {}),
                      },
                    },
                    { jobAt: null, jobStatus: "cancelled" },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ jobAt: "asc" }, { id: "asc" }],
      take: 500,
      select: {
        id: true,
        arName: true,
        enName: true,
        qty: true,
        jobAt: true,
        jobAddress: true,
        jobStatus: true,
        jobDoneAt: true,
        jobNote: true,
        technician: { select: { id: true, arName: true, enName: true } },
        sale: {
          select: {
            id: true,
            number: true,
            customerArName: true,
            customerEnName: true,
            customer: { select: { phone: true } },
          },
        },
      },
    });
    for (const it of items)
      rows.push({
        overdue:
          it.jobStatus === "pending" &&
          it.jobAt &&
          it.jobAt < dayStart(today()),
        key: `sale-${it.id}`,
        type: "sale",
        id: it.id,
        at: it.jobAt,
        title: { arName: it.arName, enName: it.enName },
        qty: n(it.qty),
        technician: it.technician,
        customer: {
          arName: it.sale.customerArName,
          enName: it.sale.customerEnName,
        },
        phone: it.sale.customer?.phone ?? null,
        address: it.jobAddress,
        status: it.jobStatus,
        doneAt: it.jobDoneAt,
        note: it.jobNote,
        ref: { kind: "sale", id: it.sale.id, number: it.sale.number },
      });
  }

  if (contractsOn && type !== "sale") {
    const visits = await prisma.maintenanceVisit.findMany({
      where: {
        contract: { status: { not: "cancelled" }, ...branchScope(user) },
        ...(technicianId
          ? {
              OR: [
                { technicianId },
                { technicianId: null, contract: { technicianId } },
              ],
            }
          : {}),
        ...(start || end
          ? {
              AND: [
                {
                  OR: [
                    {
                      status: "pending",
                      ...(end ? { dueDate: { lte: dayToDbDate(to) } } : {}),
                    },
                    {
                      status: { not: "pending" },
                      dueDate: {
                        ...(start ? { gte: dayToDbDate(from) } : {}),
                        ...(end ? { lte: dayToDbDate(to) } : {}),
                      },
                    },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: 500,
      select: {
        id: true,
        dueDate: true,
        status: true,
        doneAt: true,
        note: true,
        technician: { select: { id: true, arName: true, enName: true } },
        contract: {
          select: {
            id: true,
            number: true,
            deviceName: true,
            address: true,
            technician: { select: { id: true, arName: true, enName: true } },
            customer: { select: { arName: true, enName: true, phone: true } },
          },
        },
      },
    });
    const todayDay = today();
    for (const v of visits) {
      const due = v.dueDate.toISOString().slice(0, 10);
      rows.push({
        key: `visit-${v.id}`,
        type: "visit",
        id: v.id,
        at: v.dueDate,
        dueDay: due,
        overdue: v.status === "pending" && due < todayDay,
        title: { arName: v.contract.deviceName, enName: v.contract.deviceName },
        technician: v.technician ?? v.contract.technician,
        customer: v.contract.customer,
        phone: v.contract.customer?.phone ?? null,
        address: v.contract.address,
        status: v.status === "skipped" ? "cancelled" : v.status,
        doneAt: v.doneAt,
        note: v.note,
        ref: { kind: "contract", id: v.contract.id, number: v.contract.number },
      });
    }
  }

  rows.sort(
    (a, b) =>
      (a.at ? new Date(a.at).getTime() : 0) -
      (b.at ? new Date(b.at).getTime() : 0),
  );
  return rows;
}

// تحديث موعد سطر فاتورة: اتنفذ / اتأجل لموعد تاني / اتلغى / فني تاني
export async function updateSaleJob(
  { id, status, at, technicianId, note },
  user,
) {
  await assertModule("technicians");
  const it = await prisma.saleItem.findFirst({
    where: { id, jobStatus: { not: null }, sale: branchScope(user) },
    select: { id: true },
  });
  if (!it) throw new AppError("NotFound");
  if (technicianId) {
    const t = await prisma.technician.findUnique({
      where: { id: technicianId },
      select: { id: true },
    });
    if (!t) throw new AppError("TechnicianNotFound");
  }
  await prisma.saleItem.update({
    where: { id },
    data: {
      ...(status
        ? {
            jobStatus: status,
            jobDoneAt: status === "done" ? new Date() : null,
          }
        : {}),
      ...(at !== undefined ? { jobAt: at ? new Date(at) : null } : {}),
      ...(technicianId !== undefined ? { technicianId } : {}),
      ...(note !== undefined ? { jobNote: note } : {}),
    },
  });
  return { id };
}

// ------------------------------------------------------------
// تقرير العمولات: لكل مقدم خدمة صافي السطور اللي نفذها/باعها في الفترة
// (البيع ناقص المرتجع، بعد الخصم ومن غير الضريبة) والعمولة على كل سطر:
// استثناء الصنف ← استثناء القسم (أو القسم الأب) ← النسبة العامة
// (الخدمات: commissionRate، الأصناف العادية: productRate)
// المبلغ الثابت: القيمة × الكمية (المرتجع بالسالب)
// ------------------------------------------------------------
function lineCommission(tech, line, parentOf) {
  const rates = tech.rates ?? [];
  const cat = line.product?.categoryId ?? null;
  const rule =
    rates.find((r) => r.productId && r.productId === line.productId) ??
    rates.find((r) => r.categoryId && r.categoryId === cat) ??
    rates.find(
      (r) => r.categoryId && cat && r.categoryId === parentOf.get(cat),
    );
  if (rule) {
    return {
      commission:
        rule.rateType === "amount"
          ? round2(rule.value * line.qty)
          : round2((line.net * rule.value) / 100),
      rule:
        rule.rateType === "amount"
          ? { amount: rule.value }
          : { rate: rule.value },
    };
  }
  const rate = line.isService ? tech.commissionRate : tech.productRate;
  return { commission: round2((line.net * rate) / 100), rule: { rate } };
}

export async function commissionReport(
  { from, to, fromTime, toTime, technicianId },
  user,
) {
  await assertModule("technicians");
  // الفترة بأيام العمل (بداية يوم العمل في الإعدادات العامة)
  const h = await getDayStartHour();
  const items = await prisma.saleItem.findMany({
    where: {
      technicianId: technicianId ?? { not: null },
      sale: {
        ...branchScope(user),
        date: bizRange({ from, to, fromTime, toTime }, h),
      },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      productId: true,
      arName: true,
      enName: true,
      qty: true,
      netAmount: true,
      jobStatus: true,
      technicianId: true,
      product: { select: { categoryId: true, isService: true } },
      sale: {
        select: {
          id: true,
          type: true,
          number: true,
          date: true,
          customerArName: true,
          customerEnName: true,
        },
      },
    },
  });
  const [techs, cats] = await Promise.all([
    prisma.technician.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.technicianId))] } },
      select: {
        id: true,
        arName: true,
        enName: true,
        commissionRate: true,
        productRate: true,
        rates: {
          select: {
            categoryId: true,
            productId: true,
            rateType: true,
            value: true,
          },
        },
      },
    }),
    prisma.category.findMany({ select: { id: true, parentId: true } }),
  ]);
  const parentOf = new Map(cats.map((c) => [c.id, c.parentId]));
  const byId = new Map(
    techs.map((t) => [
      t.id,
      {
        ...toDTO(t),
        lines: [],
        jobs: 0,
        services: 0,
        products: 0,
        net: 0,
        commission: 0,
      },
    ]),
  );
  for (const it of items) {
    const t = byId.get(it.technicianId);
    if (!t) continue;
    const sign = it.sale.type === "return" ? -1 : 1;
    const line = {
      productId: it.productId,
      product: it.product,
      isService: Boolean(it.product?.isService),
      qty: sign * n(it.qty),
      net: sign * n(it.netAmount),
    };
    const { commission, rule } = lineCommission(t, line, parentOf);
    t.net = round2(t.net + line.net);
    t.commission = round2(t.commission + commission);
    if (sign > 0) {
      t.jobs++;
      if (line.isService) t.services++;
      else t.products++;
    }
    t.lines.push({
      id: it.id,
      name: { arName: it.arName, enName: it.enName },
      qty: line.qty,
      net: line.net,
      isService: line.isService,
      commission,
      rule,
      status: it.jobStatus,
      sale: it.sale,
    });
  }
  const rows = [...byId.values()].map(({ rates: _r, ...t }) => t);
  return {
    rows,
    totals: {
      jobs: rows.reduce((s, r) => s + r.jobs, 0),
      net: round2(rows.reduce((s, r) => s + r.net, 0)),
      commission: round2(rows.reduce((s, r) => s + r.commission, 0)),
    },
  };
}
