import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { productTax } from "@/lib/zatca-tax";
import { getMainWarehouseId, syncOpeningStock } from "./stock.service";
import { alignBatches } from "./batch.service";

// ============================================================
// تعديل جماعي للأصناف (لمالك البرنامج): استثناءات لتصحيح بيانات كتير مرة واحدة
// - الضريبة: نسبة الضريبة و/أو «السعر شامل الضريبة» لكل الأصناف
// - الرصيد الافتتاحي: رقم واحد لكل الأصناف (الرئيسي افتراضياً، أو مستودع تاني)
// النطاق: كل الأصناف أو قسم معيّن، و onlyEmpty = اللي قيمتها الحالية صفر بس
// ============================================================

// الأصناف اللي هتتعدل
// branchWarehouseId: مستودع غير الرئيسي ← «اللي مالهوش رصيد» بيتشاف فيه هو
function scopeWhere(op, { categoryId, onlyEmpty }, branchWarehouseId = null) {
  const emptyOpening = branchWarehouseId
    ? {
        warehouses: {
          none: { warehouseId: branchWarehouseId, openingQty: { gt: 0 } },
        },
      }
    : { startStock: 0, productUnits: { none: { startStock: { gt: 0 } } } };
  return {
    ...(categoryId ? { categoryId } : {}),
    // الرصيد الافتتاحي: الخدمات مالهاش مخزون
    ...(op === "opening" ? { isService: false } : {}),
    ...(onlyEmpty
      ? op === "opening"
        ? emptyOpening
        : { taxRate: 0 }
      : {}),
  };
}

// المستودع المختار: الرئيسي (أو فاضي) ← null (خانات الصنف نفسه)، غيره ← رقمه
async function branchTarget(warehouseId) {
  if (!warehouseId) return null;
  if (warehouseId === (await getMainWarehouseId())) return null;
  const wh = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true },
  });
  if (!wh) throw new AppError("WarehouseNotFound");
  return wh.id;
}

export async function countBulkProducts(op, { warehouseId, ...scope }) {
  const target = op === "opening" ? await branchTarget(warehouseId) : null;
  return prisma.product.count({ where: scopeWhere(op, scope, target) });
}

// الضريبة: مرة واحدة (updateMany) - النسبة صفر ← فئة «خارج النطاق» وسببها زي الفورم
export async function applyBulkTax({ taxRate, includeTax, ...scope }) {
  const data = {
    ...(taxRate == null
      ? {}
      : {
          taxRate,
          ...productTax({ taxRate, taxCategory: "O" }),
        }),
    ...(includeTax == null ? {} : { isPriceIncludeTax: includeTax }),
  };
  if (!Object.keys(data).length) return { updated: 0 };
  const res = await prisma.product.updateMany({
    where: scopeWhere("tax", scope),
    data,
  });
  return { updated: res.count };
}

// الرصيد الافتتاحي: على دفعات (الواجهة بتبعت آخر رقم اتعدّل afterId)
// - الرئيسي: رصيد الصنف بالوحدة الأساسية = الرقم، وأرصدة الوحدات الإضافية صفر
// - مستودع تاني: صف الصنف في جدول المستودعات (زي جدول شاشة الصنف)، وده بيخليه متاح فيه
// وحركة الافتتاحي في المستودع بتتعدل بالفرق (زي شاشة الصنف) + الدفعات للمتتبع
const OPENING_CHUNK = 300;

export async function applyBulkOpening({
  qty,
  afterId = 0,
  warehouseId,
  ...scope
}) {
  const target = await branchTarget(warehouseId);
  const list = await prisma.product.findMany({
    where: { ...scopeWhere("opening", scope, target), id: { gt: afterId } },
    orderBy: { id: "asc" },
    take: OPENING_CHUNK,
    select: { id: true, cost: true },
  });
  for (const p of list) {
    if (target) {
      await prisma.productWarehouse.upsert({
        where: {
          productId_warehouseId: { productId: p.id, warehouseId: target },
        },
        create: { productId: p.id, warehouseId: target, openingQty: qty },
        update: { openingQty: qty, openingUnitId: null },
      });
    } else {
      await prisma.$transaction([
        prisma.product.update({
          where: { id: p.id },
          data: { startStock: qty },
        }),
        prisma.productUnit.updateMany({
          where: { productId: p.id },
          data: { startStock: 0 },
        }),
      ]);
    }
    await syncOpeningStock(p.id, qty, Number(p.cost ?? 0), target);
    await alignBatches(prisma, p.id);
  }
  return {
    done: list.length,
    lastId: list.at(-1)?.id ?? afterId,
    finished: list.length < OPENING_CHUNK,
  };
}
