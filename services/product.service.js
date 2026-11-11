import "server-only";
import { hasFeature } from "@/lib/plan-features";
import { alignBatches } from "./batch.service";
import { assertPlanLimit } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import {
  availableInWhere,
  getMainWarehouseId,
  getVisibleWarehouses,
  syncOpeningStock,
  userWarehouseId,
} from "./stock.service";
import { can } from "@/lib/permissions";
import { saveImage, deleteImage } from "@/lib/upload";
import { hasModule } from "@/lib/modules";

// مجلد صور المنتجات داخل uploads
const IMAGES_FOLDER = "products";

// ------------------------------------------------------------
// تحويل البيانات للواجهة
// ------------------------------------------------------------
// الأسعار في قاعدة البيانات من نوع Decimal (دقيق جداً للحسابات المالية)
// لكن Decimal كائن خاص لا يمكن إرساله للمتصفح، فنحوّله لرقم عادي

const toNumber = (value) =>
  value === null || value === undefined ? 0 : Number(value);

function toProductUnitDTO(pu) {
  return {
    id: pu.id,
    unitId: pu.unitId,
    unit: pu.unit,
    conversionFactor: toNumber(pu.conversionFactor),
    barcode: pu.barcode,
    cost: toNumber(pu.cost),
    price: toNumber(pu.price),
    startStock: toNumber(pu.startStock),
  };
}

function toProductDTO(p) {
  return {
    ...p,
    cost: toNumber(p.cost),
    price: toNumber(p.price),
    wholesalePrice: toNumber(p.wholesalePrice),
    taxRate: toNumber(p.taxRate),
    ...(p.productUnits
      ? { productUnits: p.productUnits.map(toProductUnitDTO) }
      : {}),
  };
}

const nameSelect = { id: true, arName: true, enName: true };

const productSelect = {
  id: true,
  code: true,
  arName: true,
  enName: true,
  image: true,
  cost: true,
  price: true,
  wholesalePrice: true,
  taxRate: true,
  isPriceIncludeTax: true,
  taxCategory: true,
  taxExemptionCode: true,
  taxExemptionReason: true,
  startStock: true,
  isActive: true,
  isService: true,
  // تتبع الصلاحية (ميزة expiry)
  trackExpiry: true,
  expiryAlertDays: true,
  // المستودعات اللي الصنف متاح فيها (true = كلها)
  allWarehouses: true,
  serialCount: true,
  serialLabel1: true,
  serialLabel2: true,
  warrantyMonths: true,
  warrantyType: true,
  followUpDays: true,
  changeKm: true,
  changeMonths: true,
  durationMin: true,
  // المقاسات والألوان (وحدة variants)
  modelId: true,
  size: true,
  color: true,
  categoryId: true,
  baseUnitId: true,
  category: { select: nameSelect },
  baseUnit: { select: nameSelect },
};

// ------------------------------------------------------------
// القراءة
// ------------------------------------------------------------

// وحدات الصنف للتفصيل بالكرتونة والشدة والحبة (الأساسية factor = 1)
const unitsList = (p) => [
  { unit: p.baseUnit, factor: 1 },
  ...p.productUnits.map((u) => ({
    unit: u.unit,
    factor: toNumber(u.conversionFactor),
  })),
];

const sumQty = (balances) =>
  Math.round(balances.reduce((s, b) => s + toNumber(b.qty), 0) * 1000) / 1000;

// كل المنتجات (لجدول المنتجات)
// warehouseIds: المستودعات التي يراها المستخدم ← عمود "الرصيد" = مجموع رصيده فيها
// onlyWarehouseId: موظف الفرع ← أصناف مستودع فرعه بس
export async function getProducts({
  warehouseIds = [],
  onlyWarehouseId = null,
} = {}) {
  const products = await prisma.product.findMany({
    where: await availableInWhere(onlyWarehouseId),
    orderBy: { id: "desc" },
    select: {
      ...productSelect,
      // المستودعات المتاح فيها (فلتر المستودع في الجدول)
      warehouses: { select: { warehouseId: true } },
      _count: { select: { productUnits: true } },
      productUnits: {
        select: { conversionFactor: true, unit: { select: nameSelect } },
      },
      stockBalances: {
        where: { warehouseId: { in: warehouseIds } },
        select: { qty: true },
      },
    },
  });

  return products.map(({ productUnits, stockBalances, warehouses, ...p }) => ({
    ...toProductDTO(p),
    warehouseIds: warehouses.map((w) => w.warehouseId),
    units: unitsList({ ...p, productUnits }),
    stock: sumQty(stockBalances),
  }));
}

// كارت الصنف (نافذة العرض): كل بيانات الصنف ووحداته ورصيده في كل مستودع
export async function getProductDetails(id, user) {
  const warehouses = await getVisibleWarehouses(user);
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      ...productSelect,
      createdAt: true,
      updatedAt: true,
      category: {
        select: { ...nameSelect, parent: { select: nameSelect } },
      },
      productUnits: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          unitId: true,
          conversionFactor: true,
          barcode: true,
          cost: true,
          price: true,
          startStock: true,
          unit: { select: nameSelect },
        },
      },
      stockBalances: {
        where: { warehouseId: { in: warehouses.map((w) => w.id) } },
        select: { warehouseId: true, qty: true },
      },
    },
  });
  if (!product) return null;

  const { stockBalances, ...rest } = product;
  const dto = toProductDTO(rest);
  const qtyOf = new Map(
    stockBalances.map((b) => [b.warehouseId, toNumber(b.qty)]),
  );
  return {
    ...dto,
    units: unitsList(rest),
    // الرصيد الافتتاحي الكلي بالوحدة الأساسية
    openingTotal: openingTotal(dto.startStock, dto.productUnits),
    stock: sumQty(stockBalances),
    byWarehouse: warehouses.map((w) => ({
      id: w.id,
      arName: w.arName,
      enName: w.enName,
      isMain: w.isMain,
      qty: qtyOf.get(w.id) ?? 0,
    })),
  };
}

// منتج واحد مع وحداته الإضافية (لصفحة التعديل)
export async function getProductById(id) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      ...productSelect,
      // المستودعات المتاح فيها + الرصيد الافتتاحي في كل واحد
      warehouses: {
        select: { warehouseId: true, openingQty: true, openingUnitId: true },
      },
      productUnits: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          unitId: true,
          conversionFactor: true,
          barcode: true,
          cost: true,
          price: true,
          startStock: true,
          unit: { select: nameSelect },
        },
      },
    },
  });

  if (!product) return null;
  const { warehouses, ...rest } = product;
  return {
    ...toProductDTO(rest),
    warehouses: warehouses.map((w) => ({
      warehouseId: w.warehouseId,
      openingQty: toNumber(w.openingQty),
      openingUnitId: w.openingUnitId,
    })),
  };
}

// مستودعات شاشة الصنف (جدول «متاح فين + الرصيد الافتتاحي»):
// المدير: كل المستودعات النشطة | موظف الفرع: مستودع فرعه بس
// + اسم الفرع المربوط بكل مستودع
export async function getProductWarehouseOptions(user) {
  const all = can(user, "allBranches.view");
  const own = all ? null : await userWarehouseId(user);
  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true, ...(all ? {} : { id: own ?? -1 }) },
    orderBy: [{ isMain: "desc" }, { id: "asc" }],
    select: {
      id: true,
      arName: true,
      enName: true,
      isMain: true,
      branches: { select: { arName: true, enName: true } },
    },
  });
  return { warehouses, all };
}

// القوائم التي يحتاجها فورم المنتج: الأقسام والوحدات النشطة
export async function getProductFormOptions() {
  const [categories, units] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ parentId: "asc" }, { id: "asc" }],
      select: { ...nameSelect, parent: { select: nameSelect } },
    }),
    prisma.unit.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: nameSelect,
    }),
  ]);

  return { categories, units };
}

// ------------------------------------------------------------
// قواعد مساعدة
// ------------------------------------------------------------

// الرصيد الافتتاحي بالوحدة الأساسية:
// رصيد الوحدة الأساسية + (رصيد كل وحدة إضافية × معامل تحويلها)
// مثال: 5 حبة + 10 كرتونة (×24) + 3 شدة (×6) = 263 حبة
const openingTotal = (startStock, units) =>
  Math.round(
    ((startStock ?? 0) +
      units.reduce(
        (s, u) => s + (u.startStock ?? 0) * (u.conversionFactor ?? 1),
        0,
      )) *
      1000,
  ) / 1000;

// القسم والوحدات المختارة لازم تكون موجودة
async function assertReferences({ categoryId, baseUnitId, units }) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!category) throw new AppError("CategoryNotFound");

  const unitIds = [...new Set([baseUnitId, ...units.map((u) => u.unitId)])];
  const found = await prisma.unit.count({ where: { id: { in: unitIds } } });
  if (found !== unitIds.length) throw new AppError("UnitNotFound");
}

// الاسم: ممكن يتكرر بس في مجموعة (قسم) مختلفة
// (موبايل في سامسونج وموبايل في آيفون ← مسموح، اتنين في نفس القسم ← لا)
// (بتستخدمها شاشة المطعم كمان: إضافة صنف المنيو من هناك)
export async function assertUniqueName(
  { arName, enName, categoryId },
  excludeId = null,
) {
  const clash = await prisma.product.findFirst({
    where: {
      categoryId,
      OR: [{ arName }, { enName }],
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { arName: true, enName: true },
  });
  if (!clash) return;
  const field = clash.arName === arName ? "arName" : "enName";
  throw new AppError("ProductNameInCategory", [clash[field]], {
    [field]: "ProductNameInCategory",
  });
}

// الكود والباركود لازم يكونوا فريدين في البرنامج كله
// (كود المنتج = باركود الوحدة الأساسية، فلا يتكرر مع باركود أي وحدة إضافية)
// excludeProductId: في التعديل نستثني المنتج نفسه
async function assertUniqueCodes({ code, units }, excludeProductId = null) {
  const barcodes = units.map((u) => u.barcode).filter(Boolean);
  const allCodes = [code, ...barcodes];
  const notThisProduct = excludeProductId
    ? { not: excludeProductId }
    : undefined;

  const [productConflict, unitConflict] = await Promise.all([
    prisma.product.findFirst({
      where: { code: { in: allCodes }, id: notThisProduct },
      select: { code: true },
    }),
    prisma.productUnit.findFirst({
      where: { barcode: { in: allCodes }, productId: notThisProduct },
      select: { barcode: true },
    }),
  ]);

  if (productConflict) {
    throw new AppError("BarcodeExists", [productConflict.code]);
  }
  if (unitConflict) {
    throw new AppError("BarcodeExists", [unitConflict.barcode]);
  }
}

// حقول الأرقام التسلسلية والضمان: لو الوحدة مقفولة عند الشركة
// الإضافة بالقيم الافتراضية، والتعديل منلمسهاش
const SERIAL_FIELDS = [
  "serialCount",
  "serialLabel1",
  "serialLabel2",
  "warrantyMonths",
  "warrantyType",
];
export async function withoutDisabledFields(input) {
  // الخدمة مالهاش رصيد افتتاحي ولا أرقام تسلسلية
  const data = input.isService
    ? { ...input, startStock: 0, serialCount: 0 }
    : input;
  const rest = { ...data };
  // تتبع الصلاحية: ميزة الشركة مقفولة ← الحقول بتتساب زي ما هي، والخدمة مالهاش
  if (!(await hasFeature("expiry"))) {
    delete rest.trackExpiry;
    delete rest.expiryAlertDays;
  } else if (rest.isService) rest.trackExpiry = false;
  // الخدمة مالهاش متابعة، والوحدة المقفولة: الحقل بيتساب زي ما هو
  if (!(await hasModule("followUps"))) delete rest.followUpDays;
  else if (rest.isService) rest.followUpDays = 0;
  // التغيير الدوري (زيت...): للصنف والخدمة، والوحدة المقفولة: زي ما هو
  if (!(await hasModule("vehicles"))) {
    delete rest.changeKm;
    delete rest.changeMonths;
  }
  // مدة الخدمة (الحجوزات): للخدمة بس
  if (!(await hasModule("bookings"))) delete rest.durationMin;
  else if (!rest.isService) rest.durationMin = 0;
  if (await hasModule("serials")) return rest;
  for (const f of SERIAL_FIELDS) delete rest[f];
  return rest;
}

// ------------------------------------------------------------
// الخدمة: الوحدة "خدمة" والقسم "خدمات" بيتعملوا تلقائي أول مرة
// ------------------------------------------------------------
// (بتستخدمها شاشة المطعم كمان: وحدة «خدمة» وقسم «خدمات» لأصناف الرسوم)
export async function findOrCreate(model, arName, enName) {
  const where = { OR: [{ arName }, { enName }] };
  const found = await prisma[model].findFirst({ where, select: { id: true } });
  if (found) return found.id;
  try {
    const row = await prisma[model].create({
      data: { arName, enName },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    // اتعمل في نفس اللحظة من طلب تاني
    if (error?.code !== "P2002") throw error;
    const again = await prisma[model].findFirst({
      where,
      select: { id: true },
    });
    if (!again) throw error;
    return again.id;
  }
}

// الخدمة: الوحدة دايماً "خدمة"، والقسم "خدمات" لو ما اختارش، ومالهاش
// وحدات إضافية ولا تكلفة ولا رصيد ولا أرقام تسلسلية
export async function serviceDefaults(data, rawUnits) {
  if (!data.isService) return { data, units: rawUnits };
  const [baseUnitId, categoryId] = await Promise.all([
    findOrCreate("unit", "خدمة", "Service"),
    data.categoryId
      ? data.categoryId
      : findOrCreate("category", "خدمات", "Services"),
  ]);
  return {
    data: { ...data, baseUnitId, categoryId, cost: 0, startStock: 0 },
    units: [],
  };
}

// الصورة ممكن تكون مشتركة بين مقاسات الموديل (وحدة variants):
// بتتمسح من الهارد بس لو مفيش صنف تاني بيستخدمها
export async function dropImage(path) {
  if (!path) return;
  const used = await prisma.product.count({ where: { image: path } });
  if (!used) await deleteImage(path);
}

// لو حصل تكرار في نفس اللحظة (طلبان مع بعض) قاعدة البيانات ترفض بـ P2002
function handleUniqueError(error) {
  if (error?.code === "P2002") throw new AppError("BarcodeExists");
  throw error;
}

// رصيد المستودع الرئيسي (خانات الرصيد الافتتاحي في الصنف): للمدير أو لفرع على الرئيسي
// موظف فرع ليه مستودع تاني: رصيد فرعه في جدول المستودعات، والرئيسي متتلمسش
async function ownsMainStock(user) {
  if (can(user, "allBranches.view")) return true;
  return (await userWarehouseId(user)) === (await getMainWarehouseId());
}

// ------------------------------------------------------------
// المستودعات (الفروع) اللي الصنف متاح فيها + رصيده الافتتاحي في كل واحد
// ------------------------------------------------------------
// - المدير (عرض كل الفروع): «كل المستودعات» أو مستودعات محددة، ورصيد كل مستودع
// - موظف الفرع: مستودع فرعه بس (الصنف الجديد بيتقفل على فرعه، والتعديل
//   ميغيّرش إتاحة الفروع التانية)
// - المستودع الرئيسي: فيه كل الأصناف، ورصيده الافتتاحي في خانات الصنف نفسه
// - الصف موجود = الصنف متاح في المستودع، أو ليه رصيد افتتاحي فيه
// - الخدمة: من غير رصيد
async function saveProductWarehouses(productId, d, user, isCreate) {
  const all = can(user, "allBranches.view");
  // الشاشة مبعتتش جدول المستودعات (مستودع واحد / شاشة تانية زي المطعم):
  // التعديل ← ولا حاجة تتغير | الإضافة ← موظف الفرع بس (يتقفل على فرعه)
  if (d.stores === undefined && d.allWarehouses === undefined) {
    if (!isCreate || all) return;
  }
  const mainId = await getMainWarehouseId();
  const own = all ? null : await userWarehouseId(user);
  // الوحدة اللي الرصيد اتكتب بيها ← معامل التحويل للأساسية
  const factor = (unitId) => {
    if (!unitId || unitId === d.baseUnitId) return 1;
    const u = d.units.find((x) => x.unitId === unitId);
    if (!u) throw new AppError("UnitNotFound");
    return Number(u.conversionFactor) || 1;
  };

  // كل المستودعات ولا محددة: المدير بيختار | موظف الفرع: الجديد بيتقفل على فرعه
  let flag;
  if (all) flag = d.allWarehouses ?? (isCreate ? true : undefined);
  else if (isCreate) flag = !own || own === mainId;
  const limited =
    flag === undefined
      ? !(
          await prisma.product.findUnique({
            where: { id: productId },
            select: { allWarehouses: true },
          })
        )?.allWarehouses
      : !flag;

  // الصفوف اللي المستخدم يقدر يغيّرها (الرئيسي برّه الجدول)
  let rows = (d.stores ?? []).filter((s) => s.warehouseId !== mainId);
  if (!all) {
    rows = rows.filter((s) => s.warehouseId === own);
    if (isCreate && own && own !== mainId && !rows.length)
      rows = [{ warehouseId: own, available: true, openingQty: 0 }];
  }
  const keep = rows
    .map((r) => ({
      warehouseId: r.warehouseId,
      openingQty: d.isService ? 0 : Number(r.openingQty) || 0,
      openingUnitId: d.isService ? null : (r.openingUnitId ?? null),
      // كل المستودعات: الصف بس للرصيد الافتتاحي
      available: limited ? Boolean(r.available) : false,
    }))
    .filter((r) => r.available || r.openingQty > 0);
  // الوحدة لازم تكون من وحدات الصنف (قبل أي حفظ)
  for (const r of keep) factor(r.openingUnitId);

  const existing = await prisma.productWarehouse.findMany({
    where: { productId },
    select: { warehouseId: true },
  });
  const scope = all
    ? [
        ...new Set([
          ...existing.map((e) => e.warehouseId),
          ...rows.map((r) => r.warehouseId),
        ]),
      ]
    : own && own !== mainId
      ? [own]
      : [];
  const keepIds = new Set(keep.map((r) => r.warehouseId));

  await prisma.$transaction(async (tx) => {
    if (flag !== undefined)
      await tx.product.update({
        where: { id: productId },
        data: { allWarehouses: flag },
      });
    const drop = scope.filter((w) => !keepIds.has(w));
    if (drop.length)
      await tx.productWarehouse.deleteMany({
        where: { productId, warehouseId: { in: drop } },
      });
    for (const r of keep)
      await tx.productWarehouse.upsert({
        where: {
          productId_warehouseId: { productId, warehouseId: r.warehouseId },
        },
        create: {
          productId,
          warehouseId: r.warehouseId,
          openingQty: r.openingQty,
          openingUnitId: r.openingUnitId,
        },
        update: { openingQty: r.openingQty, openingUnitId: r.openingUnitId },
      });
  });

  // الرصيد الافتتاحي لكل مستودع ← حركة opening عليه (بالوحدة الأساسية)
  for (const w of scope) {
    const r = keep.find((x) => x.warehouseId === w);
    const qty = r
      ? Math.round(r.openingQty * factor(r.openingUnitId) * 1000) / 1000
      : 0;
    await syncOpeningStock(productId, qty, d.cost ?? 0, w);
  }
}

// ------------------------------------------------------------
// الإضافة
// ------------------------------------------------------------

// الكود التلقائي = أكبر «كود» رقمي + 1 (من عمود code مش id: الـ id رقم داخلي)
// - الأكواد اللي فيها حروف (FEE-SERVICE، A-12، مقاسات) مش بتتحسب
// - الباركودات (8 أرقام وأكتر) مش بتتحسب، عشان الترقيم يفضل 1، 2، 3...
// ولو الرقم مستخدم كباركود وحدة إضافية: اللي بعده
export async function nextProductCode() {
  const rows = await prisma.$queryRaw`SELECT MAX(CAST(code AS UNSIGNED)) AS maxCode FROM products WHERE code REGEXP '^[0-9]{1,7}$'`;
  let no = Number(rows?.[0]?.maxCode ?? 0) + 1;
  for (let i = 0; i < 50; i++, no++) {
    const code = String(no);
    const [p, u] = await Promise.all([
      prisma.product.count({ where: { code } }),
      prisma.productUnit.count({ where: { barcode: code } }),
    ]);
    if (!p && !u) return code;
  }
  return String(no);
}

export async function createProduct(
  { image, units: rawUnits, allWarehouses, stores, ...input },
  user,
) {
  // الكود فاضي ← تلقائي (الرقم اللي بعد أكبر كود)
  if (!input.code) input = { ...input, code: await nextProductCode() };
  const { data, units } = await serviceDefaults(
    await withoutDisabledFields(input),
    rawUnits,
  );
  // موظف فرع: الرصيد الافتتاحي في مستودع فرعه بس (مش الرئيسي)
  if (!(await ownsMainStock(user))) {
    data.startStock = 0;
    for (const u of units) u.startStock = 0;
  }
  // حد الأصناف في الباقة
  await assertPlanLimit("products", user);
  await assertReferences({ ...data, units });
  await assertUniqueCodes({ code: data.code, units });
  await assertUniqueName(data);

  const imagePath = image ? await saveImage(image, IMAGES_FOLDER) : null;

  try {
    // المنتج ووحداته الإضافية يُحفظون في عملية واحدة:
    // لو فشل حفظ أي وحدة لا يُحفظ المنتج
    const product = await prisma.product.create({
      data: {
        ...data,
        image: imagePath,
        productUnits: { create: units },
      },
      select: { id: true },
    });
    // الرصيد الافتتاحي ← حركة مخزون على المستودع الرئيسي
    await syncOpeningStock(
      product.id,
      openingTotal(data.startStock, units),
      data.cost ?? 0,
    );
    // المستودعات (الفروع) المتاح فيها + رصيده الافتتاحي في كل واحد
    await saveProductWarehouses(
      product.id,
      { allWarehouses, stores, ...data, units },
      user,
      true,
    );
    // متتبع بالصلاحية: الرصيد الافتتاحي ← الدفعة غير المحددة
    await alignBatches(prisma, product.id);
    return product;
  } catch (error) {
    await deleteImage(imagePath);
    handleUniqueError(error);
  }
}

// ------------------------------------------------------------
// التعديل
// ------------------------------------------------------------

export async function updateProduct(
  { id, image, removeImage, units: rawUnits, allWarehouses, stores, ...input },
  user,
) {
  const { data, units } = await serviceDefaults(
    await withoutDisabledFields(input),
    rawUnits,
  );
  const current = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      image: true,
      isService: true,
      _count: { select: { stockMovements: true } },
    },
  });
  if (!current) throw new AppError("ProductNotFound");
  // صنف عليه حركات مخزون مينفعش يتحول لخدمة (والعكس) عشان الرصيد ميتلخبطش
  if (
    Boolean(data.isService) !== Boolean(current.isService) &&
    current._count.stockMovements > 0
  )
    throw new AppError("ServiceToggleHasStock", null, {
      isService: "ServiceToggleHasStock",
    });

  await assertReferences({ ...data, units });
  await assertUniqueCodes({ code: data.code, units }, id);
  await assertUniqueName(data, id);

  // الصورة: جديدة ← نحفظها، شالها ← null، لم يغيّر ← لا نلمسها
  let newImagePath;
  if (image) newImagePath = await saveImage(image, IMAGES_FOLDER);
  else if (removeImage) newImagePath = null;
  const imageChanged = newImagePath !== undefined;

  const unitIds = units.map((u) => u.unitId);
  // موظف فرع: رصيد المستودع الرئيسي يفضل زي ما هو
  const ownsMain = await ownsMainStock(user);
  if (!ownsMain) delete data.startStock;
  const unitUpdate = (u) => {
    if (ownsMain) return u;
    const { startStock: _keep, ...rest } = u;
    void _keep;
    return rest;
  };

  try {
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...data,
        ...(imageChanged ? { image: newImagePath } : {}),
        productUnits: {
          // 1) نحذف الوحدات التي شالها المستخدم من القائمة
          deleteMany: { unitId: { notIn: unitIds } },
          // 2) الوحدات الموجودة نعدّلها، والجديدة نضيفها
          //    (نحافظ على رقم الوحدة id لأن الفواتير ستشير إليه لاحقاً)
          upsert: units.map((u) => ({
            where: { productId_unitId: { productId: id, unitId: u.unitId } },
            create: ownsMain ? u : { ...u, startStock: 0 },
            update: unitUpdate(u),
          })),
        },
      },
      select: { id: true },
    });

    if (imageChanged) await dropImage(current.image);
    // تغيير الرصيد الافتتاحي ← تعديل حركته بالفرق (الرئيسي)
    if (ownsMain)
      await syncOpeningStock(
        id,
        openingTotal(data.startStock, units),
        data.cost ?? 0,
      );
    await saveProductWarehouses(
      id,
      { allWarehouses, stores, ...data, units },
      user,
      false,
    );
    // متتبع بالصلاحية (أو رصيده اتغير): الرصيد اللي مالوش دفعة ← غير محددة
    await alignBatches(prisma, id);
    return product;
  } catch (error) {
    if (newImagePath) await deleteImage(newImagePath);
    handleUniqueError(error);
  }
}

// ------------------------------------------------------------
// الحذف
// ------------------------------------------------------------

export async function deleteProducts(ids) {
  // لا نحذف منتجاً عليه فواتير (مشتريات، ولاحقاً المبيعات)
  const used = await prisma.product.findMany({
    where: {
      id: { in: ids },
      OR: [
        { purchaseItems: { some: {} } },
        { transferItems: { some: {} } },
        { countItems: { some: {} } },
        { saleItems: { some: {} } },
        { quotationItems: { some: {} } },
      ],
    },
    select: { arName: true, enName: true },
  });
  if (used.length > 0) throw new AppError("ProductHasInvoices", used);

  const images = await prisma.product.findMany({
    where: { id: { in: ids }, image: { not: null } },
    select: { image: true },
  });

  // الوحدات الإضافية تُحذف تلقائياً (onDelete: Cascade في الـ schema)
  const { count } = await prisma.product.deleteMany({
    where: { id: { in: ids } },
  });

  for (const p of new Set(images.map((x) => x.image))) await dropImage(p);

  return { deleted: count };
}
