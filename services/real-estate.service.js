import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { assertModule } from "@/lib/modules";
import { DEFAULT_TEMPLATE } from "@/lib/rent";

// ============================================================
// تأجير العقارات - الإعداد: الملّاك والعقارات والوحدات ونماذج العقود
// - العقار تبع فرع (فواتير إيجاره على الفرع ده)، ومدير النظام بيشوف كل الفروع
// - حالة الوحدة بتتحسب: مؤجرة (في عقد ساري) / متاحة
// ============================================================

const MODULE = "realEstate";
const n = (v) => (v == null ? 0 : Number(v));
const branchScope = (user) =>
  can(user, "allBranches.view") ? {} : { branchId: user.branch.id };

// الوحدات اللي في عقد ساري ← { unitId: { contractId, number, docCode, endDate, tenant } }
export async function rentedUnits(db = prisma) {
  const rows = await db.rentContractUnit.findMany({
    where: { contract: { status: "active" } },
    select: {
      unitId: true,
      contract: {
        select: {
          id: true,
          number: true,
          docCode: true,
          endDate: true,
          customer: { select: { arName: true, enName: true } },
        },
      },
    },
  });
  return new Map(rows.map((r) => [r.unitId, r.contract]));
}

const day = (d) => (d ? d.toISOString().slice(0, 10) : null);

// كل بيانات شاشة الإعداد (الملّاك + العقارات + الوحدات + النماذج)
export async function getRealEstateSetup(user) {
  await assertModule(MODULE);
  const scope = branchScope(user);
  // أول مرة: النموذج الافتراضي لصيغة العقد
  if (!(await prisma.rentContractTemplate.count())) {
    await prisma.rentContractTemplate.create({
      data: { name: "عقد إيجار", content: DEFAULT_TEMPLATE, isDefault: true },
    });
  }
  const [owners, properties, units, templates, rented] = await Promise.all([
    prisma.propertyOwner.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        phone: true,
        idNumber: true,
        notes: true,
        isActive: true,
        _count: { select: { properties: true } },
      },
    }),
    prisma.property.findMany({
      where: scope,
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        city: true,
        district: true,
        address: true,
        notes: true,
        isActive: true,
        ownerId: true,
        owner: { select: { id: true, name: true } },
        branch: { select: { id: true, arName: true, enName: true } },
        _count: { select: { units: true } },
      },
    }),
    prisma.rentUnit.findMany({
      where: { property: scope },
      orderBy: [{ propertyId: "asc" }, { id: "asc" }],
      select: {
        id: true,
        propertyId: true,
        unitNo: true,
        kind: true,
        useType: true,
        floor: true,
        area: true,
        annualRent: true,
        details: true,
        notes: true,
        isActive: true,
        property: { select: { id: true, name: true } },
        _count: { select: { contracts: true } },
      },
    }),
    prisma.rentContractTemplate.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        useType: true,
        content: true,
        isDefault: true,
        isActive: true,
      },
    }),
    rentedUnits(),
  ]);
  return {
    owners,
    properties,
    templates,
    units: units.map((u) => {
      const c = rented.get(u.id);
      return {
        ...u,
        area: u.area == null ? null : n(u.area),
        annualRent: n(u.annualRent),
        details: Array.isArray(u.details) ? u.details : [],
        status: c ? "rented" : "available",
        contract: c ? { ...c, endDate: day(c.endDate) } : null,
      };
    }),
  };
}

// ------------------------------------------------------------
// الملّاك
// ------------------------------------------------------------
export async function saveOwner({ id, ...data }) {
  await assertModule(MODULE);
  if (id) {
    const found = await prisma.propertyOwner.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new AppError("RentOwnerNotFound");
    return prisma.propertyOwner.update({ where: { id }, data, select: { id: true } });
  }
  return prisma.propertyOwner.create({ data, select: { id: true } });
}

export async function deleteOwner(id) {
  await assertModule(MODULE);
  const used = await prisma.property.count({ where: { ownerId: id } });
  if (used) throw new AppError("RentOwnerHasProperties");
  await prisma.propertyOwner.delete({ where: { id } }).catch(() => {
    throw new AppError("RentOwnerNotFound");
  });
  return { deleted: 1 };
}

// ------------------------------------------------------------
// العقارات (الجديد على فرع المستخدم)
// ------------------------------------------------------------
const uniqueName = (error) => {
  if (error?.code === "P2002")
    throw new AppError("RentPropertyExists", null, { name: "RentPropertyExists" });
  throw error;
};

export async function saveProperty({ id, ...data }, user) {
  await assertModule(MODULE);
  try {
    if (id) {
      const found = await prisma.property.findFirst({
        where: { id, ...branchScope(user) },
        select: { id: true },
      });
      if (!found) throw new AppError("RentPropertyNotFound");
      return await prisma.property.update({ where: { id }, data, select: { id: true } });
    }
    return await prisma.property.create({
      data: { ...data, branchId: user.branch.id },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    uniqueName(error);
  }
}

export async function deleteProperty(id, user) {
  await assertModule(MODULE);
  const p = await prisma.property.findFirst({
    where: { id, ...branchScope(user) },
    select: { _count: { select: { units: true } } },
  });
  if (!p) throw new AppError("RentPropertyNotFound");
  if (p._count.units) throw new AppError("RentPropertyHasUnits");
  await prisma.property.delete({ where: { id } });
  return { deleted: 1 };
}

// ------------------------------------------------------------
// الوحدات (الرقم مايتكررش جوه نفس العقار)
// ------------------------------------------------------------
async function assertProperty(propertyId, user) {
  const p = await prisma.property.findFirst({
    where: { id: propertyId, ...branchScope(user) },
    select: { id: true },
  });
  if (!p) throw new AppError("RentPropertyNotFound");
}

export async function saveUnit({ id, ...data }, user) {
  await assertModule(MODULE);
  await assertProperty(data.propertyId, user);
  try {
    if (id) {
      const found = await prisma.rentUnit.findFirst({
        where: { id, property: branchScope(user) },
        select: { id: true },
      });
      if (!found) throw new AppError("RentUnitNotFound");
      return await prisma.rentUnit.update({ where: { id }, data, select: { id: true } });
    }
    return await prisma.rentUnit.create({ data, select: { id: true } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error?.code === "P2002")
      throw new AppError("RentUnitExists", null, { unitNo: "RentUnitExists" });
    throw error;
  }
}

export async function deleteUnit(id, user) {
  await assertModule(MODULE);
  const u = await prisma.rentUnit.findFirst({
    where: { id, property: branchScope(user) },
    select: { _count: { select: { contracts: true } } },
  });
  if (!u) throw new AppError("RentUnitNotFound");
  // عليها عقود ← تتوقف بس (العقود مرجع)
  if (u._count.contracts) throw new AppError("RentUnitHasContracts");
  await prisma.rentUnit.delete({ where: { id } });
  return { deleted: 1 };
}

// ------------------------------------------------------------
// نماذج صيغة العقد (الافتراضي واحد بس)
// ------------------------------------------------------------
export async function saveTemplate({ id, ...data }) {
  await assertModule(MODULE);
  return prisma.$transaction(async (tx) => {
    if (data.isDefault)
      await tx.rentContractTemplate.updateMany({
        where: id ? { id: { not: id } } : {},
        data: { isDefault: false },
      });
    if (id) {
      const found = await tx.rentContractTemplate.findUnique({ where: { id }, select: { id: true } });
      if (!found) throw new AppError("RentTemplateNotFound");
      return tx.rentContractTemplate.update({ where: { id }, data, select: { id: true } });
    }
    return tx.rentContractTemplate.create({ data, select: { id: true } });
  });
}

export async function deleteTemplate(id) {
  await assertModule(MODULE);
  const t = await prisma.rentContractTemplate.findUnique({
    where: { id },
    select: { _count: { select: { contracts: true } } },
  });
  if (!t) throw new AppError("RentTemplateNotFound");
  // استُخدم في عقود ← يتوقف بس (العقد محفوظ بنصه، بس الربط للمرجع)
  if (t._count.contracts) throw new AppError("RentTemplateUsed");
  await prisma.rentContractTemplate.delete({ where: { id } });
  return { deleted: 1 };
}
