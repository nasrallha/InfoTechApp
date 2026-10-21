import "server-only";
import { prisma } from "@/lib/prisma";

// ============================================================
// بيانات المنتجات لشاشة طباعة الباركود
// كل منتج يرجع ومعه "وحداته القابلة للطباعة":
//   - الوحدة الأساسية: الباركود = كود المنتج، والسعر = سعر المنتج
//   - كل وحدة إضافية: الباركود والسعر الخاصين بها (لو بدون باركود لا تُطبع)
// ============================================================

const nameSelect = { arName: true, enName: true };

const labelProductSelect = {
  id: true,
  code: true,
  arName: true,
  enName: true,
  price: true,
  taxRate: true,
  isPriceIncludeTax: true,
  baseUnit: { select: nameSelect },
  productUnits: {
    orderBy: { id: "asc" },
    select: { id: true, barcode: true, price: true, unit: { select: nameSelect } },
  },
};

// Decimal ← رقم عادي، وتجهيز قائمة الوحدات
function toLabelProduct(p) {
  return {
    id: p.id,
    arName: p.arName,
    enName: p.enName,
    taxRate: Number(p.taxRate),
    isPriceIncludeTax: p.isPriceIncludeTax,
    units: [
      { key: "base", isBase: true, unit: p.baseUnit, code: p.code, price: Number(p.price) },
      ...p.productUnits.map((pu) => ({
        key: `u${pu.id}`,
        isBase: false,
        unit: pu.unit,
        code: pu.barcode, // ممكن يكون null
        price: Number(pu.price),
      })),
    ],
  };
}

// بحث بالاسم أو الكود أو باركود أي وحدة (أول 20 نتيجة، المنتجات النشطة فقط)
export async function searchLabelProducts(query) {
  const q = query.trim();
  if (!q) return [];

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { code: { contains: q } },
        { arName: { contains: q } },
        { enName: { contains: q } },
        { productUnits: { some: { barcode: q } } },
      ],
    },
    orderBy: { id: "desc" },
    take: 20,
    select: labelProductSelect,
  });

  return products.map(toLabelProduct);
}

// منتجات معيّنة بأرقامها (عند الفتح من جدول المنتجات)
export async function getLabelProductsByIds(ids) {
  if (!ids.length) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: labelProductSelect,
  });

  // بنفس ترتيب الأرقام المطلوبة
  const byId = new Map(products.map((p) => [p.id, toLabelProduct(p)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
