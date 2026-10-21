import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { getSystemSettings } from "./system-settings.service";

// ============================================================
// محرك المخزون
// - كل دخول/خروج = حركة في stock_movements (كارت الصنف)
// - الرصيد في stock_balances يتحدث مع كل حركة داخل نفس العملية (transaction)
// - البيع بالسالب: لو الإعداد مقفول، أي حركة تجعل الرصيد أقل من صفر تُرفض
// الكميات دائماً بالوحدة الأساسية للصنف
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const EPS = 1e-9;
const round4 = (v) => Math.round((Number(v) + Number.EPSILON) * 1e4) / 1e4;

// وحدات الصنف للتفصيل (كرتونة / شدة / حبة): الأساسية factor = 1
export const unitsSelect = {
  baseUnit: { select: { id: true, arName: true, enName: true } },
  productUnits: {
    select: {
      conversionFactor: true,
      unit: { select: { id: true, arName: true, enName: true } },
    },
  },
};
export const unitsOf = (p) => [
  { unit: p.baseUnit, factor: 1 },
  ...p.productUnits.map((u) => ({
    unit: u.unit,
    factor: n(u.conversionFactor),
  })),
];

// هل البيع/الإخراج بأكثر من الرصيد مسموح؟ (الإعدادات العامة)
export async function isNegativeStockAllowed() {
  const settings = await getSystemSettings();
  return Boolean(settings.allowNegativeStock);
}

// المستودع الرئيسي (عليه الرصيد الافتتاحي)، وإلا أول مستودع
export async function getMainWarehouseId(db = prisma) {
  const main =
    (await db.warehouse.findFirst({
      where: { isMain: true },
      select: { id: true },
    })) ??
    (await db.warehouse.findFirst({
      orderBy: { id: "asc" },
      select: { id: true },
    }));
  return main?.id ?? null;
}

// ------------------------------------------------------------
// تحديث الأرصدة بمجموعة تغييرات { productId, warehouseId, qty }
// ويرفض لو رصيد أصبح سالباً (والإعداد لا يسمح)
// ------------------------------------------------------------
async function changeBalances(tx, deltas, allowNegative) {
  // تجميع تغييرات نفس الصنف في نفس المستودع
  const grouped = new Map();
  for (const d of deltas) {
    const key = `${d.productId}:${d.warehouseId}`;
    grouped.set(key, {
      productId: d.productId,
      warehouseId: d.warehouseId,
      qty: round4((grouped.get(key)?.qty ?? 0) + n(d.qty)),
    });
  }

  // ترتيب ثابت (الصنف ثم المستودع): كل العمليات بتقفل صفوف الأرصدة بنفس الترتيب
  // فكاشيرين بيبيعوا نفس الأصناف بترتيب مختلف ميقفلوش بعض (deadlock)
  const ordered = [...grouped.values()].sort(
    (a, b) => a.productId - b.productId || a.warehouseId - b.warehouseId,
  );

  const shortages = [];
  for (const g of ordered) {
    if (Math.abs(g.qty) < EPS) continue;
    const balance = await tx.stockBalance.upsert({
      where: {
        productId_warehouseId: {
          productId: g.productId,
          warehouseId: g.warehouseId,
        },
      },
      create: {
        productId: g.productId,
        warehouseId: g.warehouseId,
        qty: g.qty,
      },
      update: { qty: { increment: g.qty } },
      select: { qty: true },
    });
    if (!allowNegative && g.qty < 0 && n(balance.qty) < -EPS) {
      shortages.push({
        productId: g.productId,
        warehouseId: g.warehouseId,
        available: round4(n(balance.qty) - g.qty),
        requested: round4(-g.qty),
      });
    }
  }

  if (shortages.length) {
    const products = await tx.product.findMany({
      where: { id: { in: shortages.map((s) => s.productId) } },
      select: { id: true, arName: true, enName: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    throw new AppError(
      "InsufficientStock",
      shortages.map((s) => ({ ...byId.get(s.productId), ...s })),
    );
  }
}

// ------------------------------------------------------------
// تسجيل حركات مستند وتحديث الأرصدة
// movements: [{ productId, warehouseId, qty(+/-), cost, type, refType, refId, refNo, date }]
// ------------------------------------------------------------
export async function applyMovements(tx, movements, { allowNegative }) {
  const rows = movements.filter((m) => Math.abs(n(m.qty)) > EPS);
  if (!rows.length) return;
  await tx.stockMovement.createMany({
    data: rows.map((m) => ({
      productId: m.productId,
      warehouseId: m.warehouseId,
      qty: round4(m.qty),
      cost: round4(m.cost ?? 0),
      type: m.type,
      refType: m.refType,
      refId: m.refId,
      refNo: m.refNo ?? null,
      date: m.date ?? new Date(),
    })),
  });
  await changeBalances(tx, rows, allowNegative);
}

// ------------------------------------------------------------
// إلغاء كل حركات مستند (عند تعديله أو حذفه): الأرصدة ترجع كما كانت
// types (اختياري): أنواع معيّنة فقط
// ------------------------------------------------------------
export async function reverseMovements(
  tx,
  refType,
  refId,
  { allowNegative, types } = {},
) {
  const where = { refType, refId, ...(types ? { type: { in: types } } : {}) };
  const movements = await tx.stockMovement.findMany({
    where,
    select: { productId: true, warehouseId: true, qty: true },
  });
  if (!movements.length) return;
  await tx.stockMovement.deleteMany({ where });
  await changeBalances(
    tx,
    movements.map((m) => ({ ...m, qty: -n(m.qty) })),
    allowNegative,
  );
}

// ------------------------------------------------------------
// الرصيد الافتتاحي للصنف (من شاشة الصنف) على المستودع الرئيسي
// حركة واحدة من نوع opening لكل صنف، تتعدل بالفرق عند تغيير الرقم
// ------------------------------------------------------------
export async function syncOpeningStock(productId, qty, cost = 0) {
  return prisma.$transaction(async (tx) => {
    const warehouseId = await getMainWarehouseId(tx);
    if (!warehouseId) return;

    const existing = await tx.stockMovement.findFirst({
      where: { refType: "product", refId: productId, type: "opening" },
      select: { id: true, qty: true, warehouseId: true },
    });
    const oldQty = n(existing?.qty);
    const newQty = n(qty);
    if (Math.abs(newQty - oldQty) < EPS && existing) return;

    if (existing && Math.abs(newQty) < EPS) {
      await tx.stockMovement.delete({ where: { id: existing.id } });
    } else if (existing) {
      await tx.stockMovement.update({
        where: { id: existing.id },
        data: { qty: newQty, cost: round4(cost) },
      });
    } else if (Math.abs(newQty) > EPS) {
      await tx.stockMovement.create({
        data: {
          productId,
          warehouseId,
          qty: newQty,
          cost: round4(cost),
          type: "opening",
          refType: "product",
          refId: productId,
          date: new Date(),
        },
      });
    }

    // الرصيد الافتتاحي لا يُرفض حتى لو أصبح الرصيد سالباً
    await changeBalances(
      tx,
      [
        {
          productId,
          warehouseId: existing?.warehouseId ?? warehouseId,
          qty: newQty - oldQty,
        },
      ],
      true,
    );
  });
}

// ============================================================
// القراءة: الأرصدة وكارت الصنف
// ============================================================

// مستودعات يقدر المستخدم يشوفها: الكل لمن يملك "عرض كل الفروع"، وإلا مستودع فرعه
export async function getVisibleWarehouses(user) {
  const all = can(user, "allBranches.view");
  if (all) {
    return prisma.warehouse.findMany({
      orderBy: [{ isMain: "desc" }, { id: "asc" }],
      select: {
        id: true,
        arName: true,
        enName: true,
        isMain: true,
        isActive: true,
      },
    });
  }
  const branch = await prisma.branch.findUnique({
    where: { id: user.branch.id },
    select: {
      warehouse: {
        select: {
          id: true,
          arName: true,
          enName: true,
          isMain: true,
          isActive: true,
        },
      },
    },
  });
  if (branch?.warehouse) return [branch.warehouse];
  // فرع بدون مستودع مربوط ← المستودع الرئيسي
  const main = await prisma.warehouse.findFirst({
    where: { isMain: true },
    select: {
      id: true,
      arName: true,
      enName: true,
      isMain: true,
      isActive: true,
    },
  });
  return main ? [main] : [];
}

// أرصدة الأصناف: لكل صنف رصيده في كل مستودع من المستودعات المسموحة
// q: بحث بالاسم/الكود، categoryId: قسم، onlyNegative: الأصناف بالسالب فقط
export async function getStockBalances({
  warehouseIds,
  q = "",
  categoryId,
  onlyNegative = false,
  page = 1,
  pageSize = 50,
}) {
  if (!warehouseIds.length) return { total: 0, page, pageSize, rows: [] };
  const query = q.trim();

  const where = {
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
      onlyNegative
        ? {
            stockBalances: {
              some: { warehouseId: { in: warehouseIds }, qty: { lt: 0 } },
            },
          }
        : {},
    ],
  };

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
        cost: true,
        isActive: true,
        ...unitsSelect,
        category: { select: { arName: true, enName: true } },
        stockBalances: {
          where: { warehouseId: { in: warehouseIds } },
          select: { warehouseId: true, qty: true },
        },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    rows: products.map((p) => {
      const byWarehouse = Object.fromEntries(
        p.stockBalances.map((b) => [b.warehouseId, n(b.qty)]),
      );
      const totalQty = round4(
        p.stockBalances.reduce((s, b) => s + n(b.qty), 0),
      );
      return {
        id: p.id,
        code: p.code,
        arName: p.arName,
        enName: p.enName,
        isActive: p.isActive,
        cost: n(p.cost),
        unit: p.baseUnit,
        units: unitsOf(p),
        category: p.category,
        byWarehouse,
        totalQty,
      };
    }),
  };
}

// كارت الصنف: كل حركاته في المستودعات المسموحة، مع الرصيد بعد كل حركة
export async function getItemCard({ productId, warehouseIds }) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      code: true,
      arName: true,
      enName: true,
      ...unitsSelect,
    },
  });
  if (!product) throw new AppError("ProductNotFound");

  const movements = await prisma.stockMovement.findMany({
    where: { productId, warehouseId: { in: warehouseIds } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: 2000,
    select: {
      id: true,
      qty: true,
      cost: true,
      type: true,
      refType: true,
      refId: true,
      refNo: true,
      date: true,
      warehouse: { select: { id: true, arName: true, enName: true } },
    },
  });

  let balance = 0;
  return {
    // productUnits فيها Decimal (لا يُرسل للمتصفح) ← نرسل الوحدات كأرقام فقط
    product: {
      id: product.id,
      code: product.code,
      arName: product.arName,
      enName: product.enName,
      baseUnit: product.baseUnit,
      units: unitsOf(product),
    },
    rows: movements.map((m) => {
      balance = round4(balance + n(m.qty));
      return { ...m, qty: n(m.qty), cost: n(m.cost), balance };
    }),
  };
}
