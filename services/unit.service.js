import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { qtyProblem } from "@/lib/unit-qty";

// الحقول التي نرجعها للواجهة
const unitSelect = {
  id: true,
  arName: true,
  enName: true,
  isActive: true,
  allowDecimals: true,
};

// ------------------------------------------------------------
// القراءة
// ------------------------------------------------------------

// كل الوحدات (لجدول الوحدات)
export async function getUnits() {
  return prisma.unit.findMany({
    orderBy: { id: "asc" },
    select: unitSelect,
  });
}

// الوحدات النشطة فقط (لقوائم الاختيار في فورم المنتج)
export async function getActiveUnits() {
  return prisma.unit.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: unitSelect,
  });
}

// ------------------------------------------------------------
// قواعد مساعدة
// ------------------------------------------------------------

// P2002 = مخالفة @unique (اسم الوحدة مكرر)
function handleUniqueError(error) {
  if (error?.code === "P2002") throw new AppError("UnitNameExists");
  throw error;
}

// ------------------------------------------------------------
// الإضافة والتعديل
// ------------------------------------------------------------

export async function createUnit(data) {
  try {
    return await prisma.unit.create({ data, select: unitSelect });
  } catch (error) {
    handleUniqueError(error);
  }
}

export async function updateUnit({ id, ...data }) {
  const exists = await prisma.unit.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw new AppError("UnitNotFound");

  try {
    return await prisma.unit.update({
      where: { id },
      data,
      select: unitSelect,
    });
  } catch (error) {
    handleUniqueError(error);
  }
}

// ------------------------------------------------------------
// الحذف
// ------------------------------------------------------------

export async function deleteUnits(ids) {
  // لا نحذف وحدة مستخدمة: وحدة أساسية لمنتج، أو وحدة إضافية لمنتج
  const blocked = await prisma.unit.findMany({
    where: {
      id: { in: ids },
      OR: [
        { products: { some: {} } },
        { productUnits: { some: {} } },
        { purchaseItems: { some: {} } }, // مستخدمة في فواتير مشتريات
      ],
    },
    select: { arName: true, enName: true },
  });

  if (blocked.length > 0) throw new AppError("UnitInUse", blocked);

  const { count } = await prisma.unit.deleteMany({
    where: { id: { in: ids } },
  });
  return { deleted: count };
}

// ------------------------------------------------------------
// الكسور في الكميات (الوحدة تقبل كسور ولا لأ)
// lines: [{ productId, unitId, qty, factor, skip }] ← نفس ترتيب أصناف الفاتورة
//   (unitId فاضي = الوحدة الأساسية، skip = سطر مايتراجعش: مرتجع لسطر قديم بكسر)
// القاعدة (lib/unit-qty.js):
//   1) الوحدة اللي بيبيع بيها متقبلش كسور ← الكمية لازم رقم صحيح (1.5 شدة ✗)
//   2) الوحدة الأساسية متقبلش كسور ← الكمية بالأساسية لازم رقم صحيح
//      (كرتونة ونص من 12 حبة = 18 حبة ✓، 1.3 كرتونة = 15.6 حبة ✗)
// ------------------------------------------------------------
export async function assertUnitQty(lines, db = prisma) {
  const productIds = [
    ...new Set(lines.filter((l) => !l.skip).map((l) => l.productId)),
  ];
  if (!productIds.length) return;
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, arName: true, enName: true, baseUnitId: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const unitIds = [
    ...new Set([
      ...products.map((p) => p.baseUnitId),
      ...lines.map((l) => l.unitId).filter(Boolean),
    ]),
  ];
  const closed = new Set(
    (
      await db.unit.findMany({
        where: { id: { in: unitIds }, allowDecimals: false },
        select: { id: true },
      })
    ).map((u) => u.id),
  );
  if (!closed.size) return;

  lines.forEach((l, i) => {
    const p = byId.get(l.productId);
    if (l.skip || !p) return;
    const unitId = l.unitId ?? p.baseUnitId;
    const problem = qtyProblem({
      qty: Number(l.qty),
      factor: unitId === p.baseUnitId ? 1 : Number(l.factor ?? 1),
      unitAllows: !closed.has(unitId),
      baseAllows: !closed.has(p.baseUnitId),
    });
    if (problem) {
      throw new AppError(
        problem === "unit" ? "QtyNoDecimals" : "QtyBaseNoDecimals",
        [{ arName: p.arName, enName: p.enName }],
        { [`items.${i}.qty`]: "QtyNoDecimals" },
      );
    }
  });
}
