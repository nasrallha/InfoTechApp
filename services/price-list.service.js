import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// ============================================================
// قوائم الأسعار
// - كل فرع يختار قائمة (أو بدون = الأسعار الأساسية)
// - سعر الصنف في القائمة لكل وحدة؛ الصنف بدون سعر فيها ← سعره الأساسي
// ============================================================

const n = (v) => (v == null ? null : Number(v));

const select = {
  id: true,
  arName: true,
  enName: true,
  isActive: true,
  notes: true,
  branches: { select: { id: true, arName: true, enName: true } },
  _count: { select: { prices: true } },
};

export async function getPriceLists() {
  return prisma.priceList.findMany({ orderBy: { id: "asc" }, select });
}

export async function getActivePriceLists() {
  return prisma.priceList.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: { id: true, arName: true, enName: true },
  });
}

export async function getPriceList(id) {
  return prisma.priceList.findUnique({ where: { id }, select });
}

function handleUniqueError(error) {
  if (error?.code === "P2002") throw new AppError("PriceListNameExists");
  throw error;
}

export async function createPriceList(data) {
  try {
    return await prisma.priceList.create({ data, select });
  } catch (error) {
    handleUniqueError(error);
  }
}

export async function updatePriceList({ id, ...data }) {
  const exists = await prisma.priceList.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw new AppError("PriceListNotFound");
  try {
    return await prisma.priceList.update({ where: { id }, data, select });
  } catch (error) {
    handleUniqueError(error);
  }
}

// الحذف: أسعارها تُحذف معها، والفروع المربوطة ترجع للأسعار الأساسية
export async function deletePriceLists(ids) {
  const { count } = await prisma.priceList.deleteMany({
    where: { id: { in: ids } },
  });
  return { deleted: count };
}

// ------------------------------------------------------------
// أصناف القائمة: كل صنف ووحداته (الأساسية + الإضافية)
// basePrice: السعر الأساسي للوحدة، listPrice: سعرها في القائمة (أو null)
// ------------------------------------------------------------
export async function getPriceListProducts({
  priceListId,
  q = "",
  categoryId,
  page = 1,
  pageSize = 30,
}) {
  const query = q.trim();
  const where = {
    isActive: true,
    AND: [
      query
        ? {
            OR: [
              { code: { contains: query } },
              { arName: { contains: query } },
              { enName: { contains: query } },
              { productUnits: { some: { barcode: query } } },
            ],
          }
        : {},
      categoryId
        ? { OR: [{ categoryId }, { category: { parentId: categoryId } }] }
        : {},
    ],
  };

  const unitSelect = { select: { id: true, arName: true, enName: true } };
  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { arName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        code: true,
        arName: true,
        enName: true,
        price: true,
        isPriceIncludeTax: true,
        baseUnit: unitSelect,
        productUnits: {
          orderBy: { id: "asc" },
          select: { price: true, unit: unitSelect },
        },
        prices: {
          where: { priceListId },
          select: { unitId: true, price: true },
        },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    rows: products.map((p) => {
      const listPrice = new Map(p.prices.map((x) => [x.unitId, n(x.price)]));
      const units = [
        { unit: p.baseUnit, basePrice: n(p.price) },
        ...p.productUnits.map((u) => ({ unit: u.unit, basePrice: n(u.price) })),
      ];
      return {
        id: p.id,
        code: p.code,
        arName: p.arName,
        enName: p.enName,
        isPriceIncludeTax: p.isPriceIncludeTax,
        units: units.map((u) => ({
          ...u,
          listPrice: listPrice.get(u.unit.id) ?? null,
        })),
      };
    }),
  };
}

// ------------------------------------------------------------
// حفظ أسعار القائمة: سعر ← حفظ/تعديل، null ← حذف (يرجع للسعر الأساسي)
// الوحدة لازم تكون من وحدات الصنف
// ------------------------------------------------------------
export async function savePriceListPrices({ priceListId, prices }) {
  const list = await prisma.priceList.findUnique({
    where: { id: priceListId },
    select: { id: true },
  });
  if (!list) throw new AppError("PriceListNotFound");

  const productIds = [...new Set(prices.map((p) => p.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      baseUnitId: true,
      productUnits: { select: { unitId: true } },
    },
  });
  const validUnits = new Map(
    products.map((p) => [
      p.id,
      new Set([p.baseUnitId, ...p.productUnits.map((u) => u.unitId)]),
    ]),
  );
  for (const p of prices) {
    if (!validUnits.get(p.productId)?.has(p.unitId)) {
      throw new AppError("InvalidUnit");
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const p of prices) {
      const key = {
        priceListId_productId_unitId: {
          priceListId,
          productId: p.productId,
          unitId: p.unitId,
        },
      };
      if (p.price == null) {
        await tx.productPrice.deleteMany({
          where: { priceListId, productId: p.productId, unitId: p.unitId },
        });
      } else {
        await tx.productPrice.upsert({
          where: key,
          create: {
            priceListId,
            productId: p.productId,
            unitId: p.unitId,
            price: p.price,
          },
          update: { price: p.price },
        });
      }
    }
  });
  return { saved: prices.length };
}
