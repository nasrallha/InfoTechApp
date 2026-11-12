import "server-only";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { assertModule } from "@/lib/modules";
import { dbDateToDay, dayEnd, dayStart, dayToDbDate, today } from "@/lib/dates";
import { formatDocNo, saleDocNo } from "@/lib/doc-number";
import { addDays } from "@/lib/rent";

// ============================================================
// تقارير تأجير العقارات
// - units: الوحدات (مؤجرة / متاحة) بالمالك والعقار
// - dues: الدفعات بميعاد استحقاقها في فترة (والمتأخر)
// - invoices: فواتير الإيجار في فترة + الضريبة (التجاري الخاضع / السكني المعفى)
// - expiring: العقود اللي بتنتهي في فترة
// - owner: كشف حساب المالك (إيجارات وحداته في الفترة: المفوتر والمحصّل والمتبقي)
// filters: { from, to, ownerId, propertyId, status }
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const day = (d) => (d ? dbDateToDay(d) : null);
const branchScope = (user) =>
  can(user, "allBranches.view") ? {} : { branchId: user.branch.id };

// شرط وحدات العقد بالمالك / العقار
const unitWhere = (f) => ({
  ...(f.propertyId ? { propertyId: f.propertyId } : {}),
  ...(f.ownerId ? { property: { ownerId: f.ownerId } } : {}),
});
const contractUnitsWhere = (f) =>
  f.ownerId || f.propertyId ? { units: { some: { unit: unitWhere(f) } } } : {};

const unitLabel = (u) => ({
  unitNo: u.unitNo,
  kind: u.kind,
  useType: u.useType,
  property: u.property?.name ?? "",
});

// خيارات الفلاتر (الملّاك والعقارات)
export async function rentReportOptions(user) {
  await assertModule("realEstate");
  const [owners, properties] = await Promise.all([
    prisma.propertyOwner.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.property.findMany({
      where: branchScope(user),
      orderBy: { name: "asc" },
      select: { id: true, name: true, ownerId: true },
    }),
  ]);
  // المستأجرين اللي ليهم عقود (البحث بالاسم / الجوال / الهوية / الرقم الضريبي / الكود)
  const tenants = await prisma.customer.findMany({
    where: { rentContracts: { some: branchScope(user) } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, arName: true, enName: true, phone: true, idNumber: true, taxNo: true },
  });
  return { owners, properties, tenants };
}

// ------------------------------------------------------------
// الوحدات: الحالة + العقد الساري (المستأجر ونهاية العقد)
// ------------------------------------------------------------
export async function unitsReport(f, user) {
  await assertModule("realEstate");
  const units = await prisma.rentUnit.findMany({
    where: { isActive: true, property: branchScope(user), ...unitWhere(f) },
    orderBy: [{ propertyId: "asc" }, { id: "asc" }],
    select: {
      id: true,
      unitNo: true,
      kind: true,
      useType: true,
      annualRent: true,
      property: { select: { name: true, owner: { select: { name: true } } } },
      contracts: {
        where: { contract: { status: "active", endDate: { gte: dayToDbDate(today()) } } },
        take: 1,
        select: {
          annualRent: true,
          contract: {
            select: {
              id: true,
              number: true,
              docCode: true,
              endDate: true,
              customer: { select: { arName: true, enName: true, phone: true } },
            },
          },
        },
      },
    },
  });
  const rows = units
    .map((u) => {
      const c = u.contracts[0];
      return {
        id: u.id,
        ...unitLabel(u),
        owner: u.property.owner?.name ?? null,
        status: c ? "rented" : "available",
        annualRent: n(c?.annualRent ?? u.annualRent),
        contract: c
          ? {
              id: c.contract.id,
              docNo: formatDocNo("rentContract", c.contract.number, c.contract.docCode),
              endDate: day(c.contract.endDate),
              tenant: c.contract.customer,
            }
          : null,
      };
    })
    .filter((r) => !f.status || f.status === "all" || r.status === f.status);
  return {
    rows,
    totals: {
      units: units.length,
      rented: rows.filter((r) => r.status === "rented").length,
      available: rows.filter((r) => r.status === "available").length,
    },
  };
}

// الدفعة + العقد ووحداته (مشترك بين الاستحقاقات والفواتير وكشف المالك)
const installmentSelect = {
  id: true,
  seq: true,
  periodFrom: true,
  periodTo: true,
  dueDate: true,
  amount: true,
  status: true,
  sale: {
    select: {
      id: true,
      type: true,
      number: true,
      docCode: true,
      date: true,
      netAmount: true,
      taxAmount: true,
      totalAmount: true,
      paidAmount: true,
      settledAmount: true,
      remainingAmount: true,
    },
  },
  contract: {
    select: {
      id: true,
      number: true,
      docCode: true,
      ejarNo: true,
      customer: { select: { arName: true, enName: true, phone: true } },
      units: {
        orderBy: { id: "asc" },
        select: {
          annualRent: true,
          unit: {
            select: {
              unitNo: true,
              kind: true,
              useType: true,
              property: { select: { name: true, ownerId: true, owner: { select: { name: true } } } },
            },
          },
        },
      },
    },
  },
};

const installmentRow = (i) => ({
  id: i.id,
  seq: i.seq,
  periodFrom: day(i.periodFrom),
  periodTo: day(i.periodTo),
  dueDate: day(i.dueDate),
  amount: n(i.amount),
  status: i.status,
  contract: {
    id: i.contract.id,
    docNo: formatDocNo("rentContract", i.contract.number, i.contract.docCode),
    ejarNo: i.contract.ejarNo,
  },
  tenant: i.contract.customer,
  units: i.contract.units.map((u) => unitLabel(u.unit)),
  sale: i.sale
    ? {
        id: i.sale.id,
        docNo: saleDocNo(i.sale.type, i.sale.number, i.sale.docCode),
        date: i.sale.date,
        net: n(i.sale.netAmount),
        tax: n(i.sale.taxAmount),
        total: n(i.sale.totalAmount),
        remaining: n(i.sale.remainingAmount),
        // المحصّل = الإجمالي - المتبقي (المدفوع وقت الفاتورة + السندات والتسويات)
        paid: r2(n(i.sale.totalAmount) - n(i.sale.remainingAmount)),
      }
    : null,
});

// ------------------------------------------------------------
// الاستحقاقات: الدفعات بميعادها في الفترة
// status: due (لسه متفوترتش) | overdue (متأخرة) | invoiced | all
// ------------------------------------------------------------
export async function duesReport(f, user) {
  await assertModule("realEstate");
  const now = dayToDbDate(today());
  const statusWhere =
    f.status === "invoiced"
      ? { status: "invoiced" }
      : f.status === "overdue"
        ? { status: "due", dueDate: { lt: now } }
        : f.status === "all"
          ? { status: { not: "cancelled" } }
          : { status: "due" };
  const rows = await prisma.rentInstallment.findMany({
    where: {
      ...statusWhere,
      ...(f.status === "overdue"
        ? {}
        : {
            dueDate: {
              ...(f.from ? { gte: dayToDbDate(f.from) } : {}),
              ...(f.to ? { lte: dayToDbDate(f.to) } : {}),
            },
          }),
      contract: { ...branchScope(user), ...contractUnitsWhere(f) },
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    take: 3000,
    select: installmentSelect,
  });
  const list = rows.map(installmentRow);
  return {
    rows: list,
    totals: {
      count: list.length,
      amount: r2(list.reduce((s, r) => s + r.amount, 0)),
      overdue: list.filter((r) => r.status === "due" && r.dueDate < today()).length,
    },
  };
}

// ------------------------------------------------------------
// فواتير الإيجار في الفترة (بتاريخ الفاتورة) + الضريبة
// - التجاري: خاضع للضريبة (الصافي + الضريبة)
// - السكني: معفى (الصافي بس)
// ------------------------------------------------------------
export async function invoicesReport(f, user) {
  await assertModule("realEstate");
  const rows = await prisma.rentInstallment.findMany({
    where: {
      saleId: { not: null },
      sale: {
        date: {
          ...(f.from ? { gte: dayStart(f.from) } : {}),
          ...(f.to ? { lte: dayEnd(f.to) } : {}),
        },
      },
      contract: { ...branchScope(user), ...contractUnitsWhere(f) },
    },
    orderBy: [{ sale: { date: "asc" } }, { id: "asc" }],
    take: 3000,
    select: {
      ...installmentSelect,
      sale: {
        select: {
          ...installmentSelect.sale.select,
          items: {
            select: {
              netAmount: true,
              taxAmount: true,
              product: { select: { code: true } },
            },
          },
        },
      },
    },
  });
  let taxableNet = 0;
  let tax = 0;
  let exemptNet = 0;
  for (const r of rows)
    for (const it of r.sale?.items ?? []) {
      if (it.product?.code === "RENT-RES") exemptNet += n(it.netAmount);
      else {
        taxableNet += n(it.netAmount);
        tax += n(it.taxAmount);
      }
    }
  const list = rows.map(installmentRow);
  const sum = (k) => r2(list.reduce((s, r) => s + (r.sale?.[k] ?? 0), 0));
  return {
    rows: list,
    totals: {
      count: list.length,
      net: sum("net"),
      tax: sum("tax"),
      total: sum("total"),
      paid: sum("paid"),
      remaining: sum("remaining"),
      taxableNet: r2(taxableNet),
      taxAmount: r2(tax),
      exemptNet: r2(exemptNet),
    },
  };
}

// ------------------------------------------------------------
// العقود اللي بتنتهي في الفترة (السارية)
// ------------------------------------------------------------
export async function expiringReport(f, user) {
  await assertModule("realEstate");
  const from = f.from ?? today();
  const to = f.to ?? addDays(from, 30);
  const rows = await prisma.rentContract.findMany({
    where: {
      ...branchScope(user),
      status: "active",
      endDate: { gte: dayToDbDate(from), lte: dayToDbDate(to) },
      ...contractUnitsWhere(f),
      // اللي اتجدد خلاص مش محتاج تنبيه
      renewals: { none: {} },
    },
    orderBy: { endDate: "asc" },
    take: 2000,
    select: {
      id: true,
      number: true,
      docCode: true,
      ejarNo: true,
      startDate: true,
      endDate: true,
      totalAmount: true,
      customer: { select: { arName: true, enName: true, phone: true } },
      units: {
        select: {
          unit: { select: { unitNo: true, kind: true, useType: true, property: { select: { name: true } } } },
        },
      },
    },
  });
  const now = today();
  return {
    from,
    to,
    rows: rows.map((c) => ({
      id: c.id,
      docNo: formatDocNo("rentContract", c.number, c.docCode),
      ejarNo: c.ejarNo,
      startDate: day(c.startDate),
      endDate: day(c.endDate),
      totalAmount: n(c.totalAmount),
      tenant: c.customer,
      units: c.units.map((u) => unitLabel(u.unit)),
      daysLeft: Math.round((dayToDbDate(day(c.endDate)) - dayToDbDate(now)) / 86_400_000),
    })),
  };
}

// ------------------------------------------------------------
// كشف حساب المالك: إيجارات وحداته المفوترة في الفترة
// - العقد على أكتر من وحدة: نصيب وحدات المالك بنسبة إيجارها (نفس توزيع الفاتورة)
// - المحصّل والمتبقي بنفس النسبة من الفاتورة
// ------------------------------------------------------------
export async function ownerStatement(f, user) {
  await assertModule("realEstate");
  if (!f.ownerId) return { owner: null, rows: [], totals: null };
  const [owner, rows] = await Promise.all([
    prisma.propertyOwner.findUnique({
      where: { id: f.ownerId },
      select: { id: true, name: true, phone: true, idNumber: true },
    }),
    prisma.rentInstallment.findMany({
      where: {
        saleId: { not: null },
        sale: {
          date: {
            ...(f.from ? { gte: dayStart(f.from) } : {}),
            ...(f.to ? { lte: dayEnd(f.to) } : {}),
          },
        },
        contract: {
          ...branchScope(user),
          units: { some: { unit: { property: { ownerId: f.ownerId } } } },
        },
      },
      orderBy: [{ sale: { date: "asc" } }, { id: "asc" }],
      take: 3000,
      select: installmentSelect,
    }),
  ]);
  const list = rows.map((i) => {
    const units = i.contract.units;
    const annual = units.reduce((s, u) => s + n(u.annualRent), 0);
    const mine = units.filter((u) => u.unit.property.ownerId === f.ownerId);
    const ratio = annual > 0 ? mine.reduce((s, u) => s + n(u.annualRent), 0) / annual : mine.length / units.length;
    const base = installmentRow(i);
    const sale = base.sale;
    return {
      ...base,
      units: mine.map((u) => unitLabel(u.unit)),
      share: {
        net: r2((sale?.net ?? 0) * ratio),
        tax: r2((sale?.tax ?? 0) * ratio),
        total: r2((sale?.total ?? 0) * ratio),
        paid: r2((sale?.paid ?? 0) * ratio),
        remaining: r2((sale?.remaining ?? 0) * ratio),
      },
    };
  });
  const sum = (k) => r2(list.reduce((s, r) => s + r.share[k], 0));
  return {
    owner,
    rows: list,
    totals: {
      net: sum("net"),
      tax: sum("tax"),
      total: sum("total"),
      paid: sum("paid"),
      remaining: sum("remaining"),
    },
  };
}

// ------------------------------------------------------------
// تقرير المستأجر: كل عقوده ووحداته، ولكل عقد: قيمته والمفوتر والمحصّل
// والمستحق اللي لسه متسددش واللي لسه متفوترش
// ------------------------------------------------------------
export async function tenantReport(f, user) {
  await assertModule("realEstate");
  if (!f.customerId) return { tenant: null, rows: [], totals: null };
  const [tenant, contracts] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: f.customerId },
      select: { id: true, code: true, arName: true, enName: true, phone: true, idNumber: true, taxNo: true },
    }),
    prisma.rentContract.findMany({
      where: { customerId: f.customerId, ...branchScope(user) },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        number: true,
        docCode: true,
        ejarNo: true,
        startDate: true,
        endDate: true,
        status: true,
        exitDate: true,
        totalAmount: true,
        units: {
          select: {
            unit: { select: { unitNo: true, kind: true, useType: true, property: { select: { name: true } } } },
          },
        },
        installments: {
          select: {
            status: true,
            amount: true,
            sale: { select: { totalAmount: true, remainingAmount: true } },
          },
        },
      },
    }),
  ]);
  const rows = contracts.map((c) => {
    const sales = c.installments.filter((i) => i.sale).map((i) => i.sale);
    const invoiced = sales.reduce((a, x) => a + n(x.totalAmount), 0);
    const unpaid = sales.reduce((a, x) => a + n(x.remainingAmount), 0);
    return {
      id: c.id,
      docNo: formatDocNo("rentContract", c.number, c.docCode),
      ejarNo: c.ejarNo,
      startDate: day(c.startDate),
      endDate: day(c.endDate),
      exitDate: day(c.exitDate),
      status: c.status,
      units: c.units.map((u) => unitLabel(u.unit)),
      total: n(c.totalAmount),
      invoiced: r2(invoiced),
      collected: r2(invoiced - unpaid),
      unpaid: r2(unpaid),
      notInvoiced: r2(
        c.installments.filter((i) => i.status === "due").reduce((a, i) => a + n(i.amount), 0),
      ),
    };
  });
  const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));
  return {
    tenant,
    rows,
    totals: {
      contracts: rows.length,
      units: rows.reduce((a, r) => a + r.units.length, 0),
      activeUnits: rows.filter((r) => r.status === "active").reduce((a, r) => a + r.units.length, 0),
      total: sum("total"),
      invoiced: sum("invoiced"),
      collected: sum("collected"),
      unpaid: sum("unpaid"),
      notInvoiced: sum("notInvoiced"),
    },
  };
}
