import "server-only";
import { prisma } from "@/lib/prisma";
import { enabledModules } from "@/lib/modules";
import { productTax } from "@/lib/zatca-tax";
import { FREE_LINE_CODE, freeLinesOn } from "@/lib/free-line";
import { findOrCreate } from "./product.service";
import { getSystemSettings } from "./system-settings.service";

// ============================================================
// البند الحر: الصنف الداخلي + هل مفعّل للشركة
// ============================================================

// إعداد المالك (true / false / null = حسب النشاط)
export async function freeLinesSetting() {
  const s = await prisma.systemSettings.findUnique({ where: { id: 1 }, select: { freeLines: true } });
  return s?.freeLines ?? null;
}

export async function freeLinesEnabled() {
  const [setting, modules] = await Promise.all([freeLinesSetting(), enabledModules()]);
  return freeLinesOn(setting, modules);
}

// إعداد المالك: مفعّل / مقفول / حسب النشاط (null)
export async function setFreeLines(value) {
  await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, freeLines: value },
    update: { freeLines: value },
  });
  return { value };
}

// الصنف الداخلي للبند الحر (خدمة من غير مخزون، بنسبة ضريبة الشركة)
// + كل الوحدات النشطة كوحدات إضافية (معامل 1) ← المستخدم يختار الوحدة اللي عاوزها
export async function ensureFreeLineProduct() {
  let product = await prisma.product.findUnique({
    where: { code: FREE_LINE_CODE },
    select: { id: true, baseUnitId: true },
  });
  if (!product) {
    const [unitId, categoryId, settings] = await Promise.all([
      findOrCreate("unit", "خدمة", "Service"),
      findOrCreate("category", "خدمات", "Services"),
      getSystemSettings(),
    ]);
    const taxRate = Number(settings.taxRate ?? 15);
    try {
      product = await prisma.product.create({
        data: {
          code: FREE_LINE_CODE,
          arName: "بند حر",
          enName: "Free line",
          categoryId,
          baseUnitId: unitId,
          isService: true,
          cost: 0,
          price: 0,
          taxRate,
          isPriceIncludeTax: false,
          ...productTax({ taxRate, taxCategory: taxRate > 0 ? "S" : "O" }),
        },
        select: { id: true, baseUnitId: true },
      });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      product = await prisma.product.findUnique({
        where: { code: FREE_LINE_CODE },
        select: { id: true, baseUnitId: true },
      });
    }
  }
  // الوحدات الجديدة (اتضافت بعد إنشاء الصنف)
  const [units, linked] = await Promise.all([
    prisma.unit.findMany({ where: { isActive: true }, select: { id: true } }),
    prisma.productUnit.findMany({ where: { productId: product.id }, select: { unitId: true } }),
  ]);
  const have = new Set([product.baseUnitId, ...linked.map((l) => l.unitId)]);
  const missing = units.filter((u) => !have.has(u.id));
  if (missing.length)
    await prisma.productUnit.createMany({
      data: missing.map((u) => ({ productId: product.id, unitId: u.id, conversionFactor: 1 })),
      skipDuplicates: true,
    });
  return product.id;
}
