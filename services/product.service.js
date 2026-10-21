import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { getVisibleWarehouses, syncOpeningStock } from "./stock.service";
import { saveImage, deleteImage } from "@/lib/upload";

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
export async function getProducts({ warehouseIds = [] } = {}) {
  const products = await prisma.product.findMany({
    orderBy: { id: "desc" },
    select: {
      ...productSelect,
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

  return products.map(({ productUnits, stockBalances, ...p }) => ({
    ...toProductDTO(p),
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

  return product ? toProductDTO(product) : null;
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

// لو حصل تكرار في نفس اللحظة (طلبان مع بعض) قاعدة البيانات ترفض بـ P2002
function handleUniqueError(error) {
  if (error?.code === "P2002") throw new AppError("BarcodeExists");
  throw error;
}

// ------------------------------------------------------------
// الإضافة
// ------------------------------------------------------------

export async function createProduct({ image, units, ...data }) {
  await assertReferences({ ...data, units });
  await assertUniqueCodes({ code: data.code, units });

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
    return product;
  } catch (error) {
    await deleteImage(imagePath);
    handleUniqueError(error);
  }
}

// ------------------------------------------------------------
// التعديل
// ------------------------------------------------------------

export async function updateProduct({
  id,
  image,
  removeImage,
  units,
  ...data
}) {
  const current = await prisma.product.findUnique({
    where: { id },
    select: { id: true, image: true },
  });
  if (!current) throw new AppError("ProductNotFound");

  await assertReferences({ ...data, units });
  await assertUniqueCodes({ code: data.code, units }, id);

  // الصورة: جديدة ← نحفظها، شالها ← null، لم يغيّر ← لا نلمسها
  let newImagePath;
  if (image) newImagePath = await saveImage(image, IMAGES_FOLDER);
  else if (removeImage) newImagePath = null;
  const imageChanged = newImagePath !== undefined;

  const unitIds = units.map((u) => u.unitId);

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
            create: u,
            update: u,
          })),
        },
      },
      select: { id: true },
    });

    if (imageChanged) await deleteImage(current.image);
    // تغيير الرصيد الافتتاحي ← تعديل حركته بالفرق
    await syncOpeningStock(
      id,
      openingTotal(data.startStock, units),
      data.cost ?? 0,
    );
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

  await Promise.all(images.map((p) => deleteImage(p.image)));

  return { deleted: count };
}
