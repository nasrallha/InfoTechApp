import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule } from "@/lib/modules";
import { saveImage, deleteImage as deleteUpload } from "@/lib/upload";
import { isBuiltInImage } from "@/lib/tailoring";

// الصورة الجاهزة (/tailoring/..) مش بتتمسح - المرفوعة بس
const deleteImage = (path) => (isBuiltInImage(path) ? null : deleteUpload(path));
import { createCustomer } from "./customer.service";
import { partyInBranch } from "@/lib/party-scope";

// ============================================================
// الخياط - الإعدادات والعملاء:
// - خانات المقاسات ومجموعات التفاصيل واختياراتها (بصورة) - بتتعدل بالكامل
// - سعر تفصيل الثوب الافتراضي وقسم الأقمشة
// - أشخاص العميل (هو / ابنه ...) ومقاساتهم (سجل: كل مرة مقاس جديد)
// ============================================================

const MODULE = "tailoring";
const IMAGES_FOLDER = "tailoring";
const n = (v) => (v == null ? 0 : Number(v));

// ------------------------------------------------------------
// الإعدادات
// ------------------------------------------------------------
export async function getTailoringSetup() {
  await assertModule(MODULE);
  const [fields, groups, settings, categories] = await Promise.all([
    prisma.tailorField.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.tailorStyleGroup.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { choices: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    }),
    prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { tailorSewPrice: true, tailorFabricCategoryId: true, tailorDeliveryDays: true },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, arName: true, enName: true },
    }),
  ]);
  return {
    fields,
    groups,
    categories,
    settings: {
      sewPrice: n(settings?.tailorSewPrice),
      fabricCategoryId: settings?.tailorFabricCategoryId ?? null,
      deliveryDays: settings?.tailorDeliveryDays ?? 7,
    },
  };
}

export async function saveTailorSettings(data) {
  await assertModule(MODULE);
  await prisma.systemSettings.update({
    where: { id: 1 },
    data: {
      tailorSewPrice: data.sewPrice,
      tailorFabricCategoryId: data.fabricCategoryId,
      tailorDeliveryDays: data.deliveryDays,
    },
  });
  return { ok: true };
}

export async function saveField({ id, ...data }) {
  await assertModule(MODULE);
  if (id) {
    const found = await prisma.tailorField.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new AppError("NotFound");
    return prisma.tailorField.update({ where: { id }, data, select: { id: true } });
  }
  return prisma.tailorField.create({ data, select: { id: true } });
}

// حذف الخانة: المقاسات القديمة والطلبات محفوظة بنسخة الاسم، فمفيش مشكلة
export async function deleteField(id) {
  await assertModule(MODULE);
  await prisma.tailorField.delete({ where: { id } }).catch(() => {
    throw new AppError("NotFound");
  });
  return { id };
}

export async function saveStyleGroup({ id, ...data }) {
  await assertModule(MODULE);
  if (id) {
    const found = await prisma.tailorStyleGroup.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new AppError("NotFound");
    return prisma.tailorStyleGroup.update({ where: { id }, data, select: { id: true } });
  }
  return prisma.tailorStyleGroup.create({ data, select: { id: true } });
}

// حذف المجموعة باختياراتها وصورها (الطلبات القديمة محفوظة بنسخة)
export async function deleteStyleGroup(id) {
  await assertModule(MODULE);
  const g = await prisma.tailorStyleGroup.findUnique({
    where: { id },
    select: { id: true, choices: { select: { image: true } } },
  });
  if (!g) throw new AppError("NotFound");
  await prisma.tailorStyleGroup.delete({ where: { id } });
  for (const c of g.choices) if (c.image) await deleteImage(c.image);
  return { id };
}

export async function saveStyleChoice({ id, image, removeImage, libraryImage, ...data }) {
  await assertModule(MODULE);
  const group = await prisma.tailorStyleGroup.findUnique({
    where: { id: data.groupId },
    select: { id: true },
  });
  if (!group) throw new AppError("NotFound");
  const current = id
    ? await prisma.tailorStyleChoice.findUnique({ where: { id }, select: { id: true, image: true } })
    : null;
  if (id && !current) throw new AppError("NotFound");

  // الصورة: مرفوعة جديدة / من المكتبة / تتشال / زي ما هي
  const uploaded = image ? await saveImage(image, IMAGES_FOLDER) : undefined;
  const nextImage =
    uploaded !== undefined ? uploaded : libraryImage ? libraryImage : removeImage ? null : undefined;
  try {
    const row = id
      ? await prisma.tailorStyleChoice.update({
          where: { id },
          data: { ...data, ...(nextImage !== undefined ? { image: nextImage } : {}) },
          select: { id: true },
        })
      : await prisma.tailorStyleChoice.create({
          data: { ...data, image: nextImage ?? null },
          select: { id: true },
        });
    // الصورة القديمة (المرفوعة بس) بعد ما الجديدة اتحفظت
    if (current?.image && nextImage !== undefined && current.image !== nextImage)
      await deleteImage(current.image);
    return row;
  } catch (error) {
    if (uploaded) await deleteImage(uploaded);
    throw error;
  }
}

export async function deleteStyleChoice(id) {
  await assertModule(MODULE);
  const c = await prisma.tailorStyleChoice.findUnique({ where: { id }, select: { image: true } });
  if (!c) throw new AppError("NotFound");
  await prisma.tailorStyleChoice.delete({ where: { id } });
  if (c.image) await deleteImage(c.image);
  return { id };
}

// ------------------------------------------------------------
// العملاء: البحث + العميل بأشخاصه ومقاساتهم وطلباته
// ------------------------------------------------------------
const customerSel = { id: true, code: true, arName: true, enName: true, phone: true };

// البحث بالاسم / الجوال / الكود / اسم شخص تبع العميل
export async function searchTailorCustomers({ q }) {
  await assertModule(MODULE);
  const text = q.trim();
  if (!text) return [];
  const code = /^\d+$/.test(text) ? Number(text) : null;
  const rows = await prisma.customer.findMany({
    where: {
      OR: [
        { arName: { contains: text } },
        { enName: { contains: text } },
        { phone: { contains: text } },
        ...(code && code < 2_000_000_000 ? [{ code }] : []),
        { tailorPersons: { some: { name: { contains: text } } } },
      ],
    },
    orderBy: { code: "asc" },
    take: 30,
    select: {
      ...customerSel,
      tailorPersons: {
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true, name: true, kinship: true },
      },
    },
  });
  return rows;
}

// العميل بالجوال (شاشة الطلب الجديد)
export async function findTailorCustomerByPhone(phone) {
  await assertModule(MODULE);
  const c = await prisma.customer.findUnique({ where: { phone }, select: { id: true } });
  return c ? getTailorCustomer(c.id) : null;
}

// العميل + أشخاصه (ولكل شخص سجل مقاساته، الأحدث الأول)
export async function getTailorCustomer(id) {
  await assertModule(MODULE);
  const c = await prisma.customer.findUnique({
    where: { id },
    select: {
      ...customerSel,
      tailorPersons: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          kinship: true,
          notes: true,
          isActive: true,
          measurements: {
            orderBy: { id: "desc" },
            take: 50,
            select: {
              id: true,
              measures: true,
              notes: true,
              createdAt: true,
              takenBy: { select: { arFullname: true, enFullname: true } },
            },
          },
        },
      },
    },
  });
  if (!c) return null;
  return {
    ...c,
    persons: c.tailorPersons.map((p) => ({
      ...p,
      measurements: p.measurements.map((m) => ({
        ...m,
        measures: m.measures && typeof m.measures === "object" ? m.measures : {},
        createdAt: m.createdAt.toISOString(),
      })),
    })),
    tailorPersons: undefined,
  };
}

// العميل لازم يكون متاح في فرع الطلب (الفاتورة بتتأكد من كده):
// مش متاح ← يتضاف للفرع (ولو ملوش أي فرع خالص ← كل الفروع)
async function ensureInBranch(c, branchId) {
  if (!branchId) return c;
  const ok = await prisma.customer.count({ where: { id: c.id, ...partyInBranch(branchId) } });
  if (ok) return c;
  const links = await prisma.customer.findUnique({
    where: { id: c.id },
    select: { _count: { select: { branches: true } } },
  });
  await prisma.customer.update({
    where: { id: c.id },
    data: links?._count.branches ? { branches: { create: { branchId } } } : { allBranches: true },
  });
  return c;
}

// العميل: الموجود (بالرقم أو بالجوال)، أو جديد بالجوال والاسم (على فرع المستخدم)
export async function resolveTailorCustomer({ customerId, phone, customerName }, user) {
  const branchId = user?.branch?.id;
  if (customerId) {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: customerSel });
    if (!c) throw new AppError("CustomerNotFound");
    return ensureInBranch(c, branchId);
  }
  if (!phone || !/^\d{9,11}$/.test(phone))
    throw new AppError("PhoneInvalid", null, { phone: "PhoneInvalid" });
  const found = await prisma.customer.findUnique({ where: { phone }, select: customerSel });
  if (found) return ensureInBranch(found, branchId);
  // عميل جديد: الاسم لازم (مش الجوال مكان الاسم)
  const name = customerName?.trim();
  if (!name) throw new AppError("RequiredField", null, { customerName: "RequiredField" });
  try {
    return await createCustomer({ arName: name, enName: name, phone, isActive: true }, user);
  } catch (e) {
    // اتسجل في نفس اللحظة من جهاز تاني بنفس الجوال
    const again = await prisma.customer.findUnique({ where: { phone }, select: customerSel });
    if (again) return ensureInBranch(again, branchId);
    throw e;
  }
}

export async function savePerson({ id, customerId, ...data }) {
  await assertModule(MODULE);
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) throw new AppError("CustomerNotFound");
  if (id) {
    const found = await prisma.tailorPerson.findFirst({ where: { id, customerId }, select: { id: true } });
    if (!found) throw new AppError("NotFound");
    return prisma.tailorPerson.update({ where: { id }, data, select: { id: true } });
  }
  return prisma.tailorPerson.create({ data: { ...data, customerId }, select: { id: true } });
}

// حذف الشخص: لو له طلبات بيتقفل بس (الطلبات محفوظة باسمه)
export async function deletePerson(id) {
  await assertModule(MODULE);
  const p = await prisma.tailorPerson.findUnique({
    where: { id },
    select: { id: true, _count: { select: { lines: true } } },
  });
  if (!p) throw new AppError("NotFound");
  if (p._count.lines > 0) throw new AppError("TailorPersonHasOrders");
  await prisma.tailorPerson.delete({ where: { id } });
  return { id };
}

// القيم الفاضية بتتشال (المقاس اللي ما اتاخدش)
export const cleanMeasures = (measures) =>
  Object.fromEntries(
    Object.entries(measures ?? {})
      .map(([k, v]) => [k, String(v ?? "").trim()])
      .filter(([, v]) => v !== ""),
  );

// مقاس جديد للشخص (سجل: القديم بيفضل)
export async function addMeasurement({ personId, measures, notes }, user) {
  await assertModule(MODULE);
  const p = await prisma.tailorPerson.findUnique({ where: { id: personId }, select: { id: true } });
  if (!p) throw new AppError("NotFound");
  const values = cleanMeasures(measures);
  if (!Object.keys(values).length) throw new AppError("TailorNoMeasures");
  return prisma.tailorMeasurement.create({
    data: { personId, measures: values, notes: notes ?? null, takenById: user.id },
    select: { id: true },
  });
}

export async function deleteMeasurement(id) {
  await assertModule(MODULE);
  await prisma.tailorMeasurement.delete({ where: { id } }).catch(() => {
    throw new AppError("NotFound");
  });
  return { id };
}
