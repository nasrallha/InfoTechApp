import "server-only";
import { productTax } from "@/lib/zatca-tax";
import { prisma } from "@/lib/prisma";
import { parseScaleBarcode, scaleQty } from "@/lib/scale-barcode";
import { getScaleSettings } from "./system-settings.service";
import { getMainWarehouseId } from "./stock.service";

// ============================================================
// الأصناف في شاشات البيع (الكاشير والفاتورة وعرض السعر)
// لكل صنف: وحداته بسعر بيع كل وحدة، ونسبة الضريبة وهل السعر شامل،
// والصورة، والرصيد في مستودع الفرع
// سعر الوحدة = سعرها في قائمة أسعار الفرع، وإلا سعرها في شاشة الصنف
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const unitSelect = { select: { id: true, arName: true, enName: true } };

// مستودع الفرع وقائمة أسعاره (الفرع بدون مستودع ← الرئيسي)
export async function getBranchSaleContext(branchId) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { warehouseId: true, priceListId: true },
  });
  return {
    warehouseId: branch?.warehouseId ?? (await getMainWarehouseId()),
    priceListId: branch?.priceListId ?? null,
  };
}

export const saleProductSelect = (ctx) => ({
  id: true,
  code: true,
  arName: true,
  enName: true,
  image: true,
  price: true,
  cost: true,
  taxRate: true,
  isPriceIncludeTax: true,
  taxCategory: true,
  taxExemptionCode: true,
  taxExemptionReason: true,
  categoryId: true,
  baseUnit: unitSelect,
  productUnits: {
    orderBy: { id: "asc" },
    select: {
      barcode: true,
      price: true,
      cost: true,
      conversionFactor: true,
      unit: unitSelect,
    },
  },
  ...(ctx.priceListId
    ? {
        prices: {
          where: { priceListId: ctx.priceListId },
          select: { unitId: true, price: true },
        },
      }
    : {}),
  stockBalances: {
    where: { warehouseId: ctx.warehouseId ?? -1 },
    select: { qty: true },
  },
});

// exactUnitId: الوحدة التي باركودها = نص البحث بالظبط (للماسح)
export function toSaleProduct(p, q = "") {
  const listPrice = new Map(
    (p.prices ?? []).map((x) => [x.unitId, n(x.price)]),
  );
  const units = [
    {
      unit: p.baseUnit,
      factor: 1,
      price: listPrice.get(p.baseUnit.id) ?? n(p.price),
      basePrice: n(p.price),
      cost: n(p.cost),
      barcode: p.code,
    },
    ...p.productUnits.map((u) => ({
      unit: u.unit,
      factor: n(u.conversionFactor),
      price: listPrice.get(u.unit.id) ?? n(u.price),
      basePrice: n(u.price),
      cost: n(u.cost),
      barcode: u.barcode,
    })),
  ];
  const exact = q ? units.find((u) => u.barcode === q) : null;
  return {
    id: p.id,
    code: p.code,
    arName: p.arName,
    enName: p.enName,
    image: p.image,
    categoryId: p.categoryId,
    taxRate: n(p.taxRate),
    priceIncludesTax: Boolean(p.isPriceIncludeTax),
    // فئة الضريبة وسبب الإعفاء (للفوترة الإلكترونية)
    ...productTax({
      taxRate: n(p.taxRate),
      taxCategory: p.taxCategory,
      taxExemptionCode: p.taxExemptionCode,
      taxExemptionReason: p.taxExemptionReason,
    }),
    cost: n(p.cost),
    stock: n(p.stockBalances?.[0]?.qty),
    units,
    exactUnitId: exact?.unit.id ?? null,
  };
}

const searchWhere = (q) => ({
  OR: [
    { code: { contains: q } },
    { arName: { contains: q } },
    { enName: { contains: q } },
    { productUnits: { some: { barcode: q } } },
  ],
});

// بحث سريع أثناء الكتابة أو بالماسح (أول 20)
export async function searchSaleProducts(query, user) {
  const q = query.trim();
  if (!q) return [];
  const ctx = await getBranchSaleContext(user.branch.id);

  // باركود الميزان: كود الصنف + الوزن (أو الإجمالي) جوه الباركود
  const scale = parseScaleBarcode(q, await getScaleSettings());
  if (scale) {
    const plain = String(Number(scale.itemCode)); // 000123 ← 123
    const product = await prisma.product.findFirst({
      where: { isActive: true, code: { in: [scale.itemCode, plain] } },
      select: saleProductSelect(ctx),
    });
    if (product) {
      const p = toSaleProduct(product);
      const base = p.units[0];
      const qty = scaleQty(scale, base.price);
      if (qty > 0) return [{ ...p, exactUnitId: base.unit.id, scaleQty: qty }];
    }
  }

  const products = await prisma.product.findMany({
    where: { isActive: true, ...searchWhere(q) },
    orderBy: { id: "desc" },
    take: 20,
    select: saleProductSelect(ctx),
  });
  // الباركود المطابق تماماً أولاً
  return products
    .map((p) => toSaleProduct(p, q))
    .sort(
      (a, b) => Number(Boolean(b.exactUnitId)) - Number(Boolean(a.exactUnitId)),
    );
}

// تصفح: بحث + قسم (وأقسامه الفرعية) + صفحات
export async function browseSaleProducts(
  { q = "", categoryId, page = 1, pageSize = 20 },
  user,
) {
  const ctx = await getBranchSaleContext(user.branch.id);
  const query = q.trim();
  const conditions = [];
  if (query) conditions.push(searchWhere(query));
  if (categoryId) {
    conditions.push({
      OR: [{ categoryId }, { category: { parentId: categoryId } }],
    });
  }
  const where = {
    isActive: true,
    ...(conditions.length ? { AND: conditions } : {}),
  };
  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { arName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: saleProductSelect(ctx),
    }),
  ]);
  return { total, page, pageSize, rows: products.map((p) => toSaleProduct(p)) };
}

// الأقسام للكاشير: الرئيسية وتحت كل واحد أقسامه الفرعية (النشطة فقط)
export async function getSaleCategories() {
  const all = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ parentId: "asc" }, { arName: "asc" }],
    select: {
      id: true,
      arName: true,
      enName: true,
      image: true,
      parentId: true,
      parent: { select: { arName: true, enName: true } },
      _count: { select: { products: { where: { isActive: true } } } },
    },
  });
  return all.map((c) => ({
    id: c.id,
    arName: c.arName,
    enName: c.enName,
    image: c.image,
    parentId: c.parentId,
    parent: c.parent,
    productsCount: c._count.products,
  }));
}

// العملاء النشطون (لاختيار العميل في البيع)
export async function getSaleCustomers() {
  return prisma.customer.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      arName: true,
      enName: true,
      phone: true,
      taxNo: true,
      // بيانات العميل الشركة (الفاتورة الضريبية)
      registrationNo: true,
      city: true,
      district: true,
      street: true,
      buildingNo: true,
      additionalNo: true,
      postalCode: true,
      // الدولة ومعرّف العميل (الربط مع الزكاة / التصدير)
      countryCode: true,
      idScheme: true,
      idNumber: true,
    },
  });
}
