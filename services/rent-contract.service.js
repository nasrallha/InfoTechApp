import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { assertModule } from "@/lib/modules";
import { partyBranchWhere } from "@/lib/party-scope";
import { dbDateToDay, dayToDbDate, formatDay, today } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import { buildInstallments, contractTotal, contractValues, fillTemplate } from "@/lib/rent";
import { docNumberWhere, nextBranchNumber } from "./sequence.service";
import { getCompany } from "./company.service";
import { getBaseCurrency } from "./currency.service";

// ============================================================
// عقود الإيجار
// - العقد: مستأجر + وحدة أو أكتر (بإيجار سنوي لكل وحدة) + المدة + فترة السداد
// - جدول الدفعات بيتعمل لوحده (lib/rent buildInstallments)
// - نص العقد: النموذج بعد ملء الخانات (أو المعدّل من الشاشة) ← بيتحفظ كمرجع
// - الوحدة مايتأجرش لها عقدين في نفس الفترة
// - العقد اللي تاريخه خلص بيبقى «منتهي» لوحده
// - الخروج المبكر: العقد بيخلص والدفعات اللي متفوترتش بتتلغي (الوحدة بترجع متاحة)
// - التعديل: قبل أي فاتورة بس (بعدها رقم إيجار والملاحظات بس)
// ============================================================

const MODULE = "realEstate";
const n = (v) => (v == null ? 0 : Number(v));
const day = (d) => (d ? dbDateToDay(d) : null);
const branchScope = (user) =>
  can(user, "allBranches.view") ? {} : { branchId: user.branch.id };

// العقود الساري تاريخها خلص ← منتهي (قبل أي قراءة)
async function closeEnded() {
  await prisma.rentContract.updateMany({
    where: { status: "active", endDate: { lt: dayToDbDate(today()) } },
    data: { status: "ended" },
  });
}

const contractDocNo = (c) => formatDocNo("rentContract", c.number, c.docCode);

// صيغ الخانات (نفس اللي في الواجهة) ← نص بالعربي أو الإنجليزي
async function templateFormat() {
  const [t, currency, locale] = await Promise.all([
    getTranslations("RealEstate"),
    getBaseCurrency(),
    getLocale(),
  ]);
  const symbol = locale === "ar" ? currency?.arSymbol : currency?.enSymbol;
  const decimals = currency?.decimals ?? 2;
  const money = (v) =>
    `${Number(v || 0).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })} ${symbol ?? ""}`.trim();
  return {
    money,
    day: (d) => formatDay(d),
    kind: (k) => t(`kind_${k}`),
    useType: (u) => t(`use_${u}`),
    payEvery: (m) => t(`every_${m}`),
    duration: (months) => t("DurationMonths", { n: Math.round(months * 10) / 10 }),
    row: (r) =>
      t("InstallmentRow", {
        seq: r.seq,
        from: formatDay(r.periodFrom),
        to: formatDay(r.periodTo),
        due: formatDay(r.dueDate),
        amount: money(r.amount),
      }),
  };
}

// المستأجر ← بيانات الصيغة
const tenantOf = (c) => ({
  name: c.arName,
  idNo: c.idNumber || c.taxNo || null,
  phone: c.phone,
  address: [c.city, c.district, c.street].filter(Boolean).join(" - "),
});

// ------------------------------------------------------------
// خيارات شاشة العقد: المستأجرين + الوحدات (حالتها) + النماذج + اسم الشركة
// ------------------------------------------------------------
export async function contractFormOptions(user, contractId = null) {
  await assertModule(MODULE);
  await closeEnded();
  const [customers, units, templates, company, busy] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true, ...partyBranchWhere(user) },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        arName: true,
        enName: true,
        phone: true,
        taxNo: true,
        idNumber: true,
        city: true,
        district: true,
        street: true,
      },
    }),
    prisma.rentUnit.findMany({
      where: {
        isActive: true,
        property: { isActive: true, ...branchScope(user) },
      },
      orderBy: [{ propertyId: "asc" }, { id: "asc" }],
      select: {
        id: true,
        unitNo: true,
        kind: true,
        useType: true,
        annualRent: true,
        property: {
          select: { id: true, name: true, owner: { select: { name: true } } },
        },
      },
    }),
    prisma.rentContractTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
      select: { id: true, name: true, useType: true, content: true, isDefault: true },
    }),
    getCompany(),
    // الوحدات المؤجرة (عقد ساري) ← فتراتها (عشان التعارض)
    prisma.rentContractUnit.findMany({
      where: {
        contract: { status: "active", ...(contractId ? { id: { not: contractId } } : {}) },
      },
      select: {
        unitId: true,
        contract: { select: { startDate: true, endDate: true } },
      },
    }),
  ]);
  const periods = new Map();
  for (const b of busy) {
    const list = periods.get(b.unitId) ?? [];
    list.push({ from: day(b.contract.startDate), to: day(b.contract.endDate) });
    periods.set(b.unitId, list);
  }
  return {
    customers,
    templates,
    companyName: company?.arName ?? "",
    units: units.map((u) => ({
      ...u,
      annualRent: n(u.annualRent),
      property: {
        id: u.property.id,
        name: u.property.name,
        ownerName: u.property.owner?.name ?? null,
      },
      // فترات العقود السارية عليها (الوحدة متاحة لو مفيش تعارض مع مدة العقد الجديد)
      busy: periods.get(u.id) ?? [],
    })),
  };
}

// ------------------------------------------------------------
// القائمة
// ------------------------------------------------------------
export async function listContracts({ status = "active", q = "", page = 1, pageSize = 30 }, user) {
  await assertModule(MODULE);
  await closeEnded();
  const text = q.trim();
  // رقم العقد: في فرع الرمز (DM-RC-5) أو فرع المستخدم
  const ref = text ? await docNumberWhere(text, user) : null;
  const where = {
    ...branchScope(user),
    ...(status && status !== "all" ? { status } : {}),
    ...(text
      ? {
          OR: [
            { ejarNo: { contains: text } },
            { customer: { arName: { contains: text } } },
            { customer: { enName: { contains: text } } },
            { customer: { phone: { contains: text } } },
            { units: { some: { unit: { unitNo: { contains: text } } } } },
            { units: { some: { unit: { property: { name: { contains: text } } } } } },
            ...(ref ? [ref] : []),
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.rentContract.count({ where }),
    prisma.rentContract.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        docCode: true,
        ejarNo: true,
        startDate: true,
        endDate: true,
        payEvery: true,
        totalAmount: true,
        status: true,
        exitDate: true,
        customer: { select: { id: true, arName: true, enName: true, phone: true } },
        units: {
          select: {
            unit: {
              select: { unitNo: true, kind: true, property: { select: { name: true } } },
            },
          },
        },
        // أقرب دفعة مستحقة لسه متفوترتش
        installments: {
          where: { status: "due" },
          orderBy: { dueDate: "asc" },
          take: 1,
          select: { dueDate: true, amount: true },
        },
      },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    rows: rows.map((r) => ({
      ...r,
      docNo: contractDocNo(r),
      startDate: day(r.startDate),
      endDate: day(r.endDate),
      exitDate: day(r.exitDate),
      totalAmount: n(r.totalAmount),
      nextDue: r.installments[0]
        ? { date: day(r.installments[0].dueDate), amount: n(r.installments[0].amount) }
        : null,
      installments: undefined,
    })),
  };
}

// ------------------------------------------------------------
// العقد كامل (التفاصيل والطباعة والتعديل)
// ------------------------------------------------------------
export async function getContract(id, user) {
  await assertModule(MODULE);
  await closeEnded();
  const c = await prisma.rentContract.findFirst({
    where: { id, ...branchScope(user) },
    select: {
      id: true,
      number: true,
      docCode: true,
      ejarNo: true,
      startDate: true,
      endDate: true,
      payEvery: true,
      totalAmount: true,
      status: true,
      exitDate: true,
      exitReason: true,
      content: true,
      notes: true,
      templateId: true,
      renewedFromId: true,
      createdAt: true,
      renewedFrom: { select: { id: true, number: true, docCode: true } },
      renewals: { select: { id: true, number: true, docCode: true } },
      branch: { select: { id: true, arName: true, enName: true } },
      createdBy: { select: { arFullname: true, enFullname: true } },
      customer: {
        select: {
          id: true,
          code: true,
          arName: true,
          enName: true,
          phone: true,
          taxNo: true,
          idNumber: true,
          city: true,
          district: true,
          street: true,
        },
      },
      units: {
        orderBy: { id: "asc" },
        select: {
          annualRent: true,
          unit: {
            select: {
              id: true,
              unitNo: true,
              kind: true,
              useType: true,
              property: { select: { id: true, name: true, owner: { select: { name: true } } } },
            },
          },
        },
      },
      installments: {
        orderBy: { seq: "asc" },
        select: {
          id: true,
          seq: true,
          periodFrom: true,
          periodTo: true,
          dueDate: true,
          amount: true,
          status: true,
          saleId: true,
          carried: true,
          sale: {
            select: {
              id: true,
              type: true,
              number: true,
              docCode: true,
              totalAmount: true,
              remainingAmount: true,
              settledAmount: true,
              // للتعديل: طريقة الدفع الحالية + مقفولة (موقّعة للزكاة)
              payments: { take: 1, select: { paymentMethodId: true, reference: true } },
              zatcaDocument: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!c) return null;
  return {
    ...c,
    docNo: contractDocNo(c),
    startDate: day(c.startDate),
    endDate: day(c.endDate),
    exitDate: day(c.exitDate),
    totalAmount: n(c.totalAmount),
    renewedFrom: c.renewedFrom ? { ...c.renewedFrom, docNo: contractDocNo(c.renewedFrom) } : null,
    renewals: c.renewals.map((r) => ({ ...r, docNo: contractDocNo(r) })),
    units: c.units.map((u) => ({
      ...u.unit,
      annualRent: n(u.annualRent),
      property: {
        id: u.unit.property.id,
        name: u.unit.property.name,
        ownerName: u.unit.property.owner?.name ?? null,
      },
    })),
    installments: c.installments.map((i) => ({
      ...i,
      periodFrom: day(i.periodFrom),
      periodTo: day(i.periodTo),
      dueDate: day(i.dueDate),
      amount: n(i.amount),
      carried: n(i.carried),
      sale: i.sale
        ? {
            id: i.sale.id,
            type: i.sale.type,
            number: i.sale.number,
            docCode: i.sale.docCode,
            totalAmount: n(i.sale.totalAmount),
            remainingAmount: n(i.sale.remainingAmount),
            payment: i.sale.payments[0] ?? null,
            // موقّعة للزكاة أو عليها سندات قبض ← التصحيح بإشعار دائن / حذف السندات
            locked: Boolean(i.sale.zatcaDocument) || n(i.sale.settledAmount) > 0,
          }
        : null,
    })),
    // التعديل الكامل: قبل أي فاتورة وطالما ساري
    editable: c.status === "active" && c.installments.every((i) => !i.saleId),
  };
}

// ------------------------------------------------------------
// الحفظ (إضافة / تعديل)
// ------------------------------------------------------------

// الوحدات: موجودة في فروع المستخدم، ومش مأجرة في نفس الفترة لعقد تاني
async function checkUnits(tx, data, user, excludeId) {
  const ids = data.units.map((u) => u.unitId);
  const units = await tx.rentUnit.findMany({
    where: { id: { in: ids }, property: branchScope(user) },
    select: {
      id: true,
      unitNo: true,
      kind: true,
      useType: true,
      property: { select: { id: true, name: true, branchId: true, owner: { select: { name: true } } } },
    },
  });
  if (units.length !== ids.length) throw new AppError("RentUnitNotFound");
  const clash = await tx.rentContractUnit.findFirst({
    where: {
      unitId: { in: ids },
      contract: {
        status: "active",
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startDate: { lte: dayToDbDate(data.endDate) },
        endDate: { gte: dayToDbDate(data.startDate) },
      },
    },
    select: {
      unit: { select: { unitNo: true, property: { select: { name: true } } } },
    },
  });
  if (clash)
    throw new AppError("RentUnitBusy", {
      unit: `${clash.unit.property.name} - ${clash.unit.unitNo}`,
    });
  return units;
}

// النص النهائي: المكتوب من الشاشة (أو النموذج) + ملء الخانات الباقية (رقم العقد ...)
async function renderContent(tx, data, ctx) {
  let content = data.content;
  if (!content && data.templateId) {
    const t = await tx.rentContractTemplate.findUnique({
      where: { id: data.templateId },
      select: { content: true },
    });
    content = t?.content ?? null;
  }
  if (!content) return null;
  const fmt = await templateFormat();
  return fillTemplate(content, contractValues(ctx, fmt));
}

export async function saveContract({ id, ...data }, user) {
  await assertModule(MODULE);
  const decimals = (await getBaseCurrency())?.decimals ?? 2;
  const customer = await prisma.customer.findFirst({
    where: { id: data.customerId, ...partyBranchWhere(user) },
    select: {
      id: true,
      arName: true,
      phone: true,
      taxNo: true,
      idNumber: true,
      city: true,
      district: true,
      street: true,
    },
  });
  if (!customer) throw new AppError("CustomerNotFound");
  const annual = data.units.reduce((s, u) => s + u.annualRent, 0);
  const installments = buildInstallments({
    startDate: data.startDate,
    endDate: data.endDate,
    payEvery: data.payEvery,
    annualRent: annual,
    decimals,
  });
  if (!installments.length) throw new AppError("RentEndBeforeStart");
  const total = Math.round(contractTotal(installments) * 10 ** decimals) / 10 ** decimals;

  return prisma.$transaction(
    async (tx) => {
      let current = null;
      if (id) {
        current = await tx.rentContract.findFirst({
          where: { id, ...branchScope(user) },
          select: {
            id: true,
            number: true,
            docCode: true,
            branchId: true,
            status: true,
            createdAt: true,
            installments: { select: { saleId: true } },
          },
        });
        if (!current) throw new AppError("RentContractNotFound");
        // بعد أي فاتورة: رقم إيجار والملاحظات بس
        if (current.status !== "active" || current.installments.some((i) => i.saleId)) {
          return tx.rentContract.update({
            where: { id },
            data: { ejarNo: data.ejarNo, notes: data.notes },
            select: { id: true },
          });
        }
      }
      const units = await checkUnits(tx, data, user, id);
      // فرع العقد: فرع العقار (كل الوحدات لازم من فرع واحد)
      const branchIds = [...new Set(units.map((u) => u.property.branchId))];
      if (branchIds.length > 1) throw new AppError("RentUnitsBranches");
      const branchId = current?.branchId ?? branchIds[0];

      const seq = current
        ? { number: current.number, docCode: current.docCode }
        : await nextBranchNumber(tx, "rentContract", branchId);
      const company = await getCompany();
      const byId = new Map(units.map((u) => [u.id, u]));
      const content = await renderContent(tx, data, {
        docNo: formatDocNo("rentContract", seq.number, seq.docCode),
        ejarNo: data.ejarNo,
        contractDate: current ? dbDateToDay(current.createdAt) : today(),
        companyName: company?.arName ?? "",
        tenant: tenantOf(customer),
        units: data.units.map((u) => {
          const x = byId.get(u.unitId);
          return {
            unitNo: x.unitNo,
            kind: x.kind,
            useType: x.useType,
            annualRent: u.annualRent,
            property: { name: x.property.name, ownerName: x.property.owner?.name ?? null },
          };
        }),
        startDate: data.startDate,
        endDate: data.endDate,
        payEvery: data.payEvery,
        installments,
      });

      const row = {
        ejarNo: data.ejarNo,
        customerId: data.customerId,
        startDate: dayToDbDate(data.startDate),
        endDate: dayToDbDate(data.endDate),
        payEvery: data.payEvery,
        totalAmount: total,
        templateId: data.templateId,
        content,
        notes: data.notes,
      };
      const unitRows = data.units.map((u) => ({ unitId: u.unitId, annualRent: u.annualRent }));
      const instRows = installments.map((r) => ({
        seq: r.seq,
        periodFrom: dayToDbDate(r.periodFrom),
        periodTo: dayToDbDate(r.periodTo),
        dueDate: dayToDbDate(r.dueDate),
        amount: r.amount,
      }));
      if (current) {
        return tx.rentContract.update({
          where: { id },
          data: {
            ...row,
            units: { deleteMany: {}, create: unitRows },
            installments: { deleteMany: {}, create: instRows },
          },
          select: { id: true },
        });
      }
      return tx.rentContract.create({
        data: {
          ...row,
          number: seq.number,
          docCode: seq.docCode,
          branchId,
          renewedFromId: data.renewedFromId,
          createdById: user.id,
          units: { create: unitRows },
          installments: { create: instRows },
        },
        select: { id: true, number: true, docCode: true },
      });
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

// ------------------------------------------------------------
// الخروج المبكر: العقد بيخلص من التاريخ ده، والدفعات اللي متفوترتش بتتلغي
// (اللي اتفوتر خلاص بيفضل زي ما هو، ومفيش إشعارات)
// ------------------------------------------------------------
export async function terminateContract({ id, exitDate, reason }, user) {
  await assertModule(MODULE);
  const c = await prisma.rentContract.findFirst({
    where: { id, ...branchScope(user) },
    select: { id: true, status: true, startDate: true },
  });
  if (!c) throw new AppError("RentContractNotFound");
  if (c.status !== "active") throw new AppError("RentContractNotActive");
  if (exitDate < dbDateToDay(c.startDate))
    throw new AppError("RentExitBeforeStart", null, { exitDate: "RentExitBeforeStart" });
  await prisma.$transaction([
    prisma.rentInstallment.updateMany({
      where: { contractId: id, status: "due", saleId: null },
      data: { status: "cancelled" },
    }),
    prisma.rentContract.update({
      where: { id },
      data: {
        status: "terminated",
        exitDate: dayToDbDate(exitDate),
        exitReason: reason ?? null,
      },
    }),
  ]);
  return { id };
}

// ------------------------------------------------------------
// حذف العقد (صلاحية rentContracts.delete): بس لو مفيش ولا فاتورة على دفعاته
// (الفواتير لازم تتلغي الأول) - الوحدات والدفعات بتتمسح معاه
// ------------------------------------------------------------
export async function deleteContract(id, user) {
  await assertModule(MODULE);
  const c = await prisma.rentContract.findFirst({
    where: { id, ...branchScope(user) },
    select: { id: true, _count: { select: { installments: { where: { saleId: { not: null } } } } } },
  });
  if (!c) throw new AppError("RentContractNotFound");
  if (c._count.installments > 0) throw new AppError("RentContractHasInvoices");
  await prisma.rentContract.delete({ where: { id } });
  return { deleted: 1 };
}
