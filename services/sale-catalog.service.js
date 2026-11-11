import "server-only";
import { partyInBranch } from "@/lib/party-scope";
import { productTax } from "@/lib/zatca-tax";
import { prisma } from "@/lib/prisma";
import { parseScaleBarcode, scaleQty } from "@/lib/scale-barcode";
import { gtinCandidates, parseGs1 } from "@/lib/gs1";
import { dayToDbDate, today } from "@/lib/dates";
import { getScaleSettings } from "./system-settings.service";
import { availableInWhere, getMainWarehouseId } from "./stock.service";
import { hasModule } from "@/lib/modules";
import {
  asModel,
  collapseModels,
  modelFields,
  modelHeadsWhere,
  variantsEnabled,
  withModelColors,
} from "./model-list";

// ============================================================
// الأصناف في شاشات البيع (الكاشير والفاتورة وعرض السعر)
// لكل صنف: وحداته بسعر بيع كل وحدة، ونسبة الضريبة وهل السعر شامل،
// والصورة، والرصيد في مستودع الفرع
// سعر الوحدة = سعرها في قائمة أسعار الفرع، وإلا سعرها في شاشة الصنف
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const unitSelect = {
  select: { id: true, arName: true, enName: true, allowDecimals: true },
};

// مستودع الفرع وقائمة أسعاره (الفرع بدون مستودع ← الرئيسي)
// + available: شرط الأصناف المتاحة في مستودع الفرع (الفرع بيشوف أصنافه بس)
export async function getBranchSaleContext(branchId) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { warehouseId: true, priceListId: true },
  });
  const warehouseId = branch?.warehouseId ?? (await getMainWarehouseId());
  return {
    warehouseId,
    priceListId: branch?.priceListId ?? null,
    available: await availableInWhere(warehouseId),
  };
}

// شرط البحث + أصناف الفرع بس
export const inBranch = (ctx, where) =>
  ctx.available?.OR ? { AND: [where, ctx.available] } : where;

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
  isService: true,
  // الأرقام التسلسلية والضمان (وحدة serials)
  serialCount: true,
  serialLabel1: true,
  serialLabel2: true,
  warrantyMonths: true,
  warrantyType: true,
  // المتابعة الدورية (وحدة followUps): 0 = مالوش
  followUpDays: true,
  // التغيير الدوري للسيارات (وحدة vehicles): 0 = مالوش
  changeKm: true,
  changeMonths: true,
  // المقاسات والألوان (وحدة variants)
  ...modelFields,
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
  // تتبع الصلاحية: أقرب دفعة انتهاءً في مستودع الفرع (للتنبيه وقت البيع)
  trackExpiry: true,
  expiryAlertDays: true,
  batches: {
    where: {
      warehouseId: ctx.warehouseId ?? -1,
      qty: { gt: 0 },
      expDate: { not: null },
    },
    orderBy: { expDate: "asc" },
    take: 1,
    select: { expDate: true },
  },
});

// الأيام الباقية على أقرب انتهاء (سالب = منتهي) - null = مش متتبع / مفيش تاريخ
function nextExpiry(p) {
  const exp = p.trackExpiry ? p.batches?.[0]?.expDate : null;
  if (!exp) return null;
  const days = Math.round(
    (exp.getTime() - dayToDbDate(today()).getTime()) / 86_400_000,
  );
  return {
    date: exp.toISOString().slice(0, 10),
    days,
    alertDays: p.expiryAlertDays ?? null,
  };
}

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
    // خدمة: مالهاش رصيد (مفيش تنبيه "الرصيد لا يكفي")
    isService: Boolean(p.isService),
    serialCount: p.serialCount ?? 0,
    trackExpiry: Boolean(p.trackExpiry),
    nextExpiry: nextExpiry(p),
    serialLabel1: p.serialLabel1 ?? null,
    serialLabel2: p.serialLabel2 ?? null,
    warrantyMonths: p.warrantyMonths ?? 0,
    warrantyType: p.warrantyType ?? null,
    followUpDays: p.followUpDays ?? 0,
    changeKm: p.changeKm ?? 0,
    changeMonths: p.changeMonths ?? 0,
    units,
    exactUnitId: exact?.unit.id ?? null,
    // المقاسات (وحدة variants): الموديل والمقاس واللون
    modelId: p.modelId ?? null,
    size: p.size ?? null,
    color: p.color ?? null,
    colorHex: p.colorHex ?? null,
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
// models: الموديل مرة واحدة ← شبكة المقاسات (الكاشير وفاتورة البيع بس)
export async function searchSaleProducts(query, user, { models = false } = {}) {
  const q = query.trim();
  if (!q) return [];
  const ctx = await getBranchSaleContext(user.branch.id);

  // باركود الميزان: كود الصنف + الوزن (أو الإجمالي) جوه الباركود
  const scale = parseScaleBarcode(q, await getScaleSettings());
  if (scale) {
    const plain = String(Number(scale.itemCode)); // 000123 ← 123
    const product = await prisma.product.findFirst({
      where: inBranch(ctx, {
        isActive: true,
        code: { in: [scale.itemCode, plain] },
      }),
      select: saleProductSelect(ctx),
    });
    if (product) {
      const p = toSaleProduct(product);
      const base = p.units[0];
      const qty = scaleQty(scale, base.price);
      if (qty > 0) return [{ ...p, exactUnitId: base.unit.id, scaleQty: qty }];
    }
  }

  // باركود GS1 (الدواء والأغذية): رقم الصنف + الانتهاء + الدفعة ← الصنف بدفعته
  const gs1 = parseGs1(q);
  if (gs1) {
    const codes = gtinCandidates(gs1.gtin);
    const product = await prisma.product.findFirst({
      where: inBranch(ctx, {
        isActive: true,
        OR: [
          { code: { in: codes } },
          { productUnits: { some: { barcode: { in: codes } } } },
        ],
      }),
      select: saleProductSelect(ctx),
    });
    if (product) {
      const unit = product.productUnits.find((u) => codes.includes(u.barcode));
      const p = toSaleProduct(product);
      // الدفعة: برقمها، أو بتاريخ انتهائها لو مفيش رقم
      const batch = product.trackExpiry
        ? await prisma.productBatch.findFirst({
            where: {
              productId: product.id,
              warehouseId: ctx.warehouseId ?? -1,
              ...(gs1.batchNo
                ? { batchNo: gs1.batchNo }
                : gs1.expDate
                  ? { expDate: dayToDbDate(gs1.expDate) }
                  : { id: -1 }),
            },
            select: { id: true, batchNo: true, expDate: true, qty: true },
          })
        : null;
      return [
        {
          ...p,
          exactUnitId: unit?.unit.id ?? p.units[0].unit.id,
          ...(batch
            ? {
                scannedBatch: {
                  id: batch.id,
                  batchNo: batch.batchNo,
                  expDate: batch.expDate
                    ? batch.expDate.toISOString().slice(0, 10)
                    : null,
                },
              }
            : {}),
        },
      ];
    }
  }

  // الماسح على رقم تسلسلي لقطعة مسجلة (في المحل) ← الصنف بالرقم ده
  if (q.length >= 4 && (await hasModule("serials"))) {
    const found = await prisma.productSerial.findFirst({
      where: {
        // المباعة والتالفة متتباعش
        status: { notIn: ["sold", "damaged"] },
        OR: [{ serial: q }, { serial2: q }],
        product: inBranch(ctx, { isActive: true }),
      },
      orderBy: { id: "desc" },
      select: {
        serial: true,
        serial2: true,
        isUsed: true,
        product: { select: saleProductSelect(ctx) },
      },
    });
    if (found) {
      const p = toSaleProduct(found.product);
      return [
        {
          ...p,
          exactUnitId: p.units[0].unit.id,
          scannedSerial: {
            serial: found.serial,
            serial2: found.serial2 ?? null,
            isUsed: found.isUsed,
          },
        },
      ];
    }
  }

  const products = await prisma.product.findMany({
    where: inBranch(ctx, { isActive: true, ...searchWhere(q) }),
    orderBy: { id: "desc" },
    take: 20,
    select: saleProductSelect(ctx),
  });
  // الباركود المطابق تماماً أولاً
  const rows = products.map((p) => toSaleProduct(p, q));
  const list =
    models && (await variantsEnabled())
      ? await withModelColors(collapseModels(products, rows))
      : rows;
  return list.sort(
    (a, b) => Number(Boolean(b.exactUnitId)) - Number(Boolean(a.exactUnitId)),
  );
}

// تصفح: بحث + قسم (وأقسامه الفرعية) + صفحات
export async function browseSaleProducts(
  { q = "", categoryId, page = 1, pageSize = 20 },
  user,
  { models = false } = {},
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
  // المقاسات: الموديل مرة واحدة (أول مقاس منه)
  const variantsOn = models && (await variantsEnabled());
  if (variantsOn) conditions.push(await modelHeadsWhere());
  if (ctx.available?.OR) conditions.push(ctx.available);
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
  return {
    total,
    page,
    pageSize,
    rows: await withModelColors(
      products.map((p) => {
        const row = toSaleProduct(p);
        return variantsOn && p.modelId ? asModel(row, p.model) : row;
      }),
    ),
  };
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

// العملاء النشطون المتاحين في فرع المستخدم (لاختيار العميل في البيع)
export async function getSaleCustomers(user) {
  return prisma.customer.findMany({
    where: {
      isActive: true,
      ...(user?.branch?.id ? partyInBranch(user.branch.id) : {}),
    },
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
