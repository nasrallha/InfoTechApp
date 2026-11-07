import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule } from "@/lib/modules";
import { runTx } from "@/lib/transaction";

// ============================================================
// طابعات المطعم (لكل فرع) وتوزيع التحضير
// - طابعة الكاشير: الفاتورة | طابعات التحضير: كل واحدة أقسامها وأصنافها الخاصة
// - الصنف: طابعاته الخاصة ← طابعات قسمه ← الطابعة الافتراضية للفرع
// - طريقة التوصيل (شبكة / ويندوز / المتصفح) بيستخدمها وسيط الطباعة،
//   ولحد ما يشتغل كل التذاكر بتطلع من المتصفح (تذكرة لكل طابعة)
// ============================================================

const select = {
  id: true,
  branchId: true,
  name: true,
  kind: true,
  connection: true,
  host: true,
  port: true,
  windowsName: true,
  paperSize: true,
  copies: true,
  isDefault: true,
  isActive: true,
  priority: true,
  autoCut: true,
  beep: true,
  fullTicket: true,
  branch: { select: { id: true, arName: true, enName: true } },
  categories: { select: { categoryId: true } },
  products: { select: { productId: true } },
};
const toDTO = ({ categories, products, ...p }) => ({
  ...p,
  categoryIds: categories.map((c) => c.categoryId),
  productIds: products.map((x) => x.productId),
});

// شاشة الإعدادات: كل الطابعات (كل الفروع)
export async function listPrinters() {
  await assertModule("restaurant");
  const rows = await prisma.restaurantPrinter.findMany({
    orderBy: [{ branchId: "asc" }, { kind: "asc" }, { priority: "asc" }, { name: "asc" }],
    select,
  });
  return rows.map(toDTO);
}

// الكاشير: طابعات الفرع المفعّلة (للتوزيع)
export async function branchPrinters(branchId) {
  const rows = await prisma.restaurantPrinter.findMany({
    where: { branchId, isActive: true },
    orderBy: [{ kind: "asc" }, { priority: "asc" }, { name: "asc" }],
    select,
  });
  return rows.map((r) => toDTO({ ...r, branch: undefined }));
}

export async function savePrinter({ id, categoryIds, productIds, ...data }) {
  await assertModule("restaurant");
  const branch = await prisma.branch.findUnique({
    where: { id: data.branchId },
    select: { id: true },
  });
  if (!branch) throw new AppError("BranchNotFound");
  // الكاشير مالوش أقسام ولا افتراضي تحضير
  const kitchen = data.kind === "kitchen";
  const cats = kitchen ? [...new Set(categoryIds)] : [];
  const prods = kitchen ? [...new Set(productIds)] : [];
  const clean = {
    ...data,
    host: data.connection === "network" ? data.host : null,
    windowsName: data.connection === "windows" ? data.windowsName : null,
    isDefault: kitchen && data.isDefault,
    // التذكرة الكاملة للكاشير بس
    fullTicket: !kitchen && data.fullTicket,
  };
  try {
    const saved = await runTx(async (tx) => {
      const p = id
        ? await tx.restaurantPrinter.update({
            where: { id },
            data: clean,
            select: { id: true },
          })
        : await tx.restaurantPrinter.create({ data: clean, select: { id: true } });
      // طابعة تحضير افتراضية واحدة بس في الفرع
      if (clean.isDefault)
        await tx.restaurantPrinter.updateMany({
          where: { branchId: clean.branchId, id: { not: p.id } },
          data: { isDefault: false },
        });
      await tx.restaurantPrinterCategory.deleteMany({ where: { printerId: p.id } });
      if (cats.length)
        await tx.restaurantPrinterCategory.createMany({
          data: cats.map((categoryId) => ({ printerId: p.id, categoryId })),
        });
      await tx.restaurantPrinterProduct.deleteMany({ where: { printerId: p.id } });
      if (prods.length)
        await tx.restaurantPrinterProduct.createMany({
          data: prods.map((productId) => ({ printerId: p.id, productId })),
        });
      return p;
    });
    return saved;
  } catch (e) {
    if (e?.code === "P2002")
      throw new AppError("RestaurantPrinterExists", null, {
        name: "RestaurantPrinterExists",
      });
    if (e?.code === "P2025") throw new AppError("RestaurantPrinterNotFound");
    if (e?.code === "P2003") throw new AppError("ValidationError");
    throw e;
  }
}

export async function deletePrinter(id) {
  await assertModule("restaurant");
  await prisma.restaurantPrinter.delete({ where: { id } }).catch((e) => {
    if (e?.code === "P2025") throw new AppError("RestaurantPrinterNotFound");
    throw e;
  });
  return { id };
}
