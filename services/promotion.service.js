import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { dayToDbDate, dbDateToDay, today } from "@/lib/dates";

// ============================================================
// العروض والخصومات لفترة
// - على إجمالي الفاتورة، أو على أقسام (الرئيسي يشمل الفرعي)، أو على أصناف
// - شغالة من startDate لحد endDate (شاملين) ولو isActive، وعلى فروعها
// - التطبيق نفسه في lib/promotions.js (نفس الحساب في الشاشة والسيرفر)
// ============================================================

const n = (v) => (v == null ? null : Number(v));

const listSelect = {
  id: true,
  arName: true,
  enName: true,
  scope: true,
  discountType: true,
  value: true,
  minInvoice: true,
  startDate: true,
  endDate: true,
  isActive: true,
  allBranches: true,
  notes: true,
  branches: { select: { branchId: true } },
  categories: { select: { categoryId: true } },
  products: { select: { productId: true } },
  createdBy: { select: { arFullname: true, enFullname: true } },
  _count: { select: { saleItems: true, sales: true } },
};

const toDTO = (p) => ({
  id: p.id,
  arName: p.arName,
  enName: p.enName,
  scope: p.scope,
  discountType: p.discountType,
  value: n(p.value),
  minInvoice: n(p.minInvoice),
  startDate: dbDateToDay(p.startDate),
  endDate: dbDateToDay(p.endDate),
  isActive: p.isActive,
  allBranches: p.allBranches,
  notes: p.notes,
  branchIds: p.branches.map((b) => b.branchId),
  categoryIds: p.categories.map((c) => c.categoryId),
  productIds: p.products.map((x) => x.productId),
  createdBy: p.createdBy,
  usedCount: p._count.saleItems + p._count.sales,
});

export async function listPromotions() {
  const rows = await prisma.promotion.findMany({
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    select: listSelect,
  });
  return rows.map(toDTO);
}

// خيارات الشاشة: الفروع، الأقسام (رئيسي ← فرعي)، الأصناف
export async function getPromotionOptions() {
  const [branches, categories, products] = await Promise.all([
    prisma.branch.findMany({
      orderBy: { id: "asc" },
      select: { id: true, arName: true, enName: true },
    }),
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: { id: "asc" },
      select: {
        id: true,
        arName: true,
        enName: true,
        children: {
          orderBy: { id: "asc" },
          select: { id: true, arName: true, enName: true },
        },
      },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        arName: true,
        enName: true,
        price: true,
        categoryId: true,
      },
    }),
  ]);
  return {
    branches,
    categories,
    products: products.map((p) => ({ ...p, price: Number(p.price) })),
  };
}

// إضافة / تعديل (المصفوفات بتتبدل بالكامل)
export async function savePromotion(
  { id, branchIds, categoryIds, productIds, ...data },
  user,
) {
  if (data.startDate > data.endDate) {
    throw new AppError("EndBeforeStart", null, { endDate: "EndBeforeStart" });
  }
  if (data.scope === "invoice" && data.discountType === "fixedPrice") {
    throw new AppError("ValidationError", null, {
      discountType: "ValidationError",
    });
  }
  if (data.discountType === "percent" && data.value > 100) {
    throw new AppError("PercentMax", null, { value: "PercentMax" });
  }
  if (data.scope === "category" && !categoryIds.length) {
    throw new AppError("RequiredField", null, { categoryIds: "RequiredField" });
  }
  if (data.scope === "product" && !productIds.length) {
    throw new AppError("RequiredField", null, { productIds: "RequiredField" });
  }
  if (!data.allBranches && !branchIds.length) {
    throw new AppError("RequiredField", null, { branchIds: "RequiredField" });
  }

  const row = {
    arName: data.arName,
    enName: data.enName || data.arName,
    scope: data.scope,
    discountType: data.discountType,
    value: data.value,
    minInvoice: data.scope === "invoice" ? (data.minInvoice ?? null) : null,
    startDate: dayToDbDate(data.startDate),
    endDate: dayToDbDate(data.endDate),
    ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
    allBranches: data.allBranches,
    notes: data.notes ?? null,
  };
  const relations = {
    branches: {
      create: data.allBranches
        ? []
        : branchIds.map((branchId) => ({ branchId })),
    },
    categories: {
      create:
        data.scope === "category"
          ? categoryIds.map((categoryId) => ({ categoryId }))
          : [],
    },
    products: {
      create:
        data.scope === "product"
          ? productIds.map((productId) => ({ productId }))
          : [],
    },
  };

  return prisma.$transaction(async (tx) => {
    if (id) {
      const exists = await tx.promotion.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) throw new AppError("PromotionNotFound");
      await tx.promotionBranch.deleteMany({ where: { promotionId: id } });
      await tx.promotionCategory.deleteMany({ where: { promotionId: id } });
      await tx.promotionProduct.deleteMany({ where: { promotionId: id } });
      return tx.promotion.update({
        where: { id },
        data: { ...row, ...relations },
        select: { id: true },
      });
    }
    return tx.promotion.create({
      data: { ...row, ...relations, createdById: user.id },
      select: { id: true },
    });
  });
}

// تفعيل / إيقاف
export async function togglePromotion(id, isActive) {
  const { count } = await prisma.promotion.updateMany({
    where: { id },
    data: { isActive },
  });
  if (!count) throw new AppError("PromotionNotFound");
  return { id, isActive };
}

// الحذف ممنوع لو اتطبق على فواتير (يتوقف بدلاً من ذلك)
export async function deletePromotion(id) {
  const p = await prisma.promotion.findUnique({
    where: { id },
    select: { _count: { select: { saleItems: true, sales: true } } },
  });
  if (!p) throw new AppError("PromotionNotFound");
  if (p._count.saleItems + p._count.sales > 0) {
    throw new AppError("PromotionInUse");
  }
  await prisma.promotion.delete({ where: { id } });
  return { deleted: 1 };
}

// ------------------------------------------------------------
// العروض الشغالة على فرع في يوم معيّن (للشاشات والسيرفر)
// الأقسام الرئيسية بتشمل أقسامها الفرعية
// ------------------------------------------------------------
export async function getActivePromotions(branchId, day = today()) {
  const date = dayToDbDate(day);
  const rows = await prisma.promotion.findMany({
    where: {
      isActive: true,
      startDate: { lte: date },
      endDate: { gte: date },
      OR: [{ allBranches: true }, { branches: { some: { branchId } } }],
    },
    select: {
      id: true,
      arName: true,
      enName: true,
      scope: true,
      discountType: true,
      value: true,
      minInvoice: true,
      endDate: true,
      categories: {
        select: {
          categoryId: true,
          category: { select: { children: { select: { id: true } } } },
        },
      },
      products: { select: { productId: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    arName: p.arName,
    enName: p.enName,
    scope: p.scope,
    discountType: p.discountType,
    value: Number(p.value),
    minInvoice: n(p.minInvoice),
    endDate: dbDateToDay(p.endDate),
    productIds: p.products.map((x) => x.productId),
    categoryIds: [
      ...new Set(
        p.categories.flatMap((c) => [
          c.categoryId,
          ...c.category.children.map((ch) => ch.id),
        ]),
      ),
    ],
  }));
}
