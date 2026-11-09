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
  baseUnit: {
    select: { id: true, arName: true, enName: true, allowDecimals: true },
  },
  productUnits: {
    select: {
      conversionFactor: true,
      unit: {
        select: { id: true, arName: true, enName: true, allowDecimals: true },
      },
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
  const moving = movements.filter((m) => Math.abs(n(m.qty)) > EPS);
  if (!moving.length) return;
  // الخدمات (مصنعية، تركيب...) مالهاش مخزون: مفيش حركات ولا أرصدة
  const services = new Set(
    (
      await tx.product.findMany({
        where: {
          id: { in: [...new Set(moving.map((m) => m.productId))] },
          isService: true,
        },
        select: { id: true },
      })
    ).map((p) => p.id),
  );
  const rows = services.size
    ? moving.filter((m) => !services.has(m.productId))
    : moving;
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
  // البضاعة اللي دخلت مستودع ← الصنف بقى متاح فيه (يظهر في كاشير الفرع)
  await makeAvailable(
    tx,
    rows.filter((m) => n(m.qty) > EPS),
  );
}

// ------------------------------------------------------------
// الأصناف حسب المستودعات (الفروع)
// - الصنف allWarehouses = متاح في كل المستودعات
// - غير كده: متاح في المستودعات اللي ليه فيها صف في product_warehouses
// - المستودع الرئيسي فيه كل الأصناف دايماً
// ------------------------------------------------------------

// الصنف يبقى متاح في المستودعات دي (لو مش متاح في كل المستودعات)
// pairs: [{ productId, warehouseId }]
export async function makeAvailable(db, pairs) {
  if (!pairs.length) return;
  const limited = new Set(
    (
      await db.product.findMany({
        where: {
          id: { in: [...new Set(pairs.map((p) => p.productId))] },
          allWarehouses: false,
        },
        select: { id: true },
      })
    ).map((p) => p.id),
  );
  if (!limited.size) return;
  const seen = new Set();
  const data = [];
  for (const p of pairs) {
    const key = `${p.productId}:${p.warehouseId}`;
    if (!limited.has(p.productId) || seen.has(key)) continue;
    seen.add(key);
    data.push({ productId: p.productId, warehouseId: p.warehouseId });
  }
  if (data.length)
    await db.productWarehouse.createMany({ data, skipDuplicates: true });
}

// شرط «الأصناف المتاحة في المستودع ده» لاستعلامات الأصناف
// (المستودع الرئيسي أو من غير مستودع ← كل الأصناف: {})
export async function availableInWhere(warehouseId, db = prisma) {
  if (!warehouseId) return {};
  const w = await db.warehouse.findUnique({
    where: { id: warehouseId },
    select: { isMain: true },
  });
  if (!w || w.isMain) return {};
  return {
    OR: [{ allWarehouses: true }, { warehouses: { some: { warehouseId } } }],
  };
}

// مستودع فرع المستخدم (الفرع من غير مستودع ← الرئيسي)
export async function userWarehouseId(user, db = prisma) {
  const branch = await db.branch.findUnique({
    where: { id: user.branch.id },
    select: { warehouseId: true },
  });
  return branch?.warehouseId ?? (await getMainWarehouseId(db));
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
// الرصيد الافتتاحي للصنف (من شاشة الصنف)
// - warehouseId فاضي = المستودع الرئيسي (خانات الرصيد الافتتاحي في الصنف)
// - غير كده: مستودع فرع (جدول المستودعات في شاشة الصنف)
// حركة واحدة من نوع opening لكل صنف في كل مستودع، تتعدل بالفرق عند تغيير الرقم
// ------------------------------------------------------------
export async function syncOpeningStock(
  productId,
  qty,
  cost = 0,
  targetWarehouseId = null,
) {
  return prisma.$transaction(async (tx) => {
    const mainId = await getMainWarehouseId(tx);
    const warehouseId = targetWarehouseId ?? mainId;
    if (!warehouseId) return;

    // الرئيسي: حركته على الرئيسي، أو (بيانات قديمة) أي حركة افتتاحي مش لمستودع فرع
    let existing = await tx.stockMovement.findFirst({
      where: { refType: "product", refId: productId, type: "opening", warehouseId },
      select: { id: true, qty: true, warehouseId: true },
    });
    if (!existing && !targetWarehouseId) {
      const branchRows = await tx.productWarehouse.findMany({
        where: { productId },
        select: { warehouseId: true },
      });
      existing = await tx.stockMovement.findFirst({
        where: {
          refType: "product",
          refId: productId,
          type: "opening",
          warehouseId: { notIn: branchRows.map((r) => r.warehouseId) },
        },
        select: { id: true, qty: true, warehouseId: true },
      });
    }
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
        // الفروع المربوطة (للعرض: "المستودع - الفرع")
        branches: { select: { arName: true, enName: true } },
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

// ============================================================
// حركة المخزون الشاملة (شاشة الأرصدة ← "حركة المخزون")
// لكل صنف في المستودعات المختارة والفترة:
//   الرصيد الافتتاحي (قبل الفترة + رصيد أول المدة اللي جوه الفترة)
//   + مشتريات − مرتجع مشتريات − مبيعات + مرتجع مبيعات
//   + تحويل وارد − تحويل صادر ± فروق جرد − تالف + زيادة = الرصيد المتبقي
// التكلفة: متوسط مرجّح لتكلفة الشراء والرصيد الافتتاحي لحد آخر الفترة
// all: كل الصفوف (للتصدير) بدل الصفحة
// ============================================================
export const MOVEMENT_COLUMNS = [
  "purchase",
  "purchase_return",
  "sale",
  "sale_return",
  "transfer_in",
  "transfer_out",
  "count",
  "damage",
  "surplus",
];

export async function getStockMovementReport({
  warehouseIds,
  q = "",
  categoryId,
  from,
  to,
  hideIdle = false,
  page = 1,
  pageSize = 50,
  all = false,
}) {
  const empty = { total: 0, page, pageSize, rows: [], totals: {} };
  if (!warehouseIds.length) return empty;
  const query = q.trim();
  const start = from ? new Date(`${from}T00:00:00+03:00`) : null;
  const end = to ? new Date(`${to}T23:59:59.999+03:00`) : null;

  const products = await prisma.product.findMany({
    where: {
      isService: false,
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
      ],
    },
    orderBy: { arName: "asc" },
    select: {
      id: true,
      code: true,
      arName: true,
      enName: true,
      cost: true,
      isActive: true,
      ...unitsSelect,
      category: { select: { arName: true, enName: true } },
    },
  });
  if (!products.length) return empty;
  const ids = products.map((p) => p.id);
  const inWh = { warehouseId: { in: warehouseIds } };

  const [before, inPeriod, costRows] = await Promise.all([
    // الرصيد قبل بداية الفترة
    start
      ? prisma.stockMovement.groupBy({
          by: ["productId"],
          where: { ...inWh, productId: { in: ids }, date: { lt: start } },
          _sum: { qty: true },
        })
      : [],
    prisma.stockMovement.groupBy({
      by: ["productId", "type"],
      where: {
        ...inWh,
        productId: { in: ids },
        ...(start || end
          ? {
              date: {
                ...(start ? { gte: start } : {}),
                ...(end ? { lte: end } : {}),
              },
            }
          : {}),
      },
      _sum: { qty: true },
    }),
    // للمتوسط المرجّح: حركات الشراء والرصيد الافتتاحي لحد آخر الفترة
    prisma.stockMovement.findMany({
      where: {
        productId: { in: ids },
        type: { in: ["purchase", "opening"] },
        qty: { gt: 0 },
        ...(end ? { date: { lte: end } } : {}),
      },
      select: { productId: true, qty: true, cost: true },
    }),
  ]);

  const beforeOf = new Map(before.map((b) => [b.productId, n(b._sum.qty)]));
  const moves = new Map();
  for (const g of inPeriod) {
    if (!moves.has(g.productId)) moves.set(g.productId, {});
    moves.get(g.productId)[g.type] = n(g._sum.qty);
  }
  const costAcc = new Map();
  for (const c of costRows) {
    const a = costAcc.get(c.productId) ?? { q: 0, v: 0 };
    a.q += n(c.qty);
    a.v += n(c.qty) * n(c.cost);
    costAcc.set(c.productId, a);
  }

  const totals = { opening: 0, balance: 0, value: 0 };
  for (const k of MOVEMENT_COLUMNS) totals[k] = 0;

  const rows = [];
  for (const p of products) {
    const m = moves.get(p.id) ?? {};
    const opening = round4((beforeOf.get(p.id) ?? 0) + (m.opening ?? 0));
    const row = {
      id: p.id,
      code: p.code,
      arName: p.arName,
      enName: p.enName,
      isActive: p.isActive,
      unit: p.baseUnit,
      units: unitsOf(p),
      category: p.category,
      opening,
    };
    let balance = opening;
    let moved = Math.abs(opening) > EPS;
    for (const k of MOVEMENT_COLUMNS) {
      const v = round4(m[k] ?? 0);
      balance += v;
      if (Math.abs(v) > EPS) moved = true;
      // الخارج (مبيعات، تالف، تحويل صادر...) بيتعرض موجب، والجرد بإشارته
      row[k] = k === "count" ? v : Math.abs(v);
    }
    if (hideIdle && !moved) continue;
    const acc = costAcc.get(p.id);
    const cost = acc && acc.q > EPS ? round4(acc.v / acc.q) : n(p.cost);
    row.balance = round4(balance);
    row.cost = cost;
    row.value = Math.round(row.balance * cost * 100) / 100;
    rows.push(row);
    totals.opening += row.opening;
    for (const k of MOVEMENT_COLUMNS) totals[k] += row[k];
    totals.balance += row.balance;
    totals.value += row.value;
  }
  for (const k of Object.keys(totals))
    totals[k] =
      k === "value" ? Math.round(totals[k] * 100) / 100 : round4(totals[k]);

  return {
    total: rows.length,
    page,
    pageSize,
    totals,
    rows: all ? rows : rows.slice((page - 1) * pageSize, page * pageSize),
  };
}

// رصيد أصناف في مستودع واحد (بالوحدة الأساسية) ← { [productId]: qty }
export async function warehouseQtys(warehouseId, productIds) {
  if (!productIds.length) return {};
  const rows = await prisma.stockBalance.findMany({
    where: { warehouseId, productId: { in: productIds } },
    select: { productId: true, qty: true },
  });
  const out = Object.fromEntries(productIds.map((id) => [id, 0]));
  for (const r of rows) out[r.productId] = round4(n(r.qty));
  return out;
}

// الصنف في المستودعات التانية (اللي فيها رصيد) - تنبيه البيع لما فرعك مفيهوش كفاية
// ← [{ warehouseId, arName, enName, isMain, branches: [{arName, enName}], qty }]
export async function stockElsewhere(productId, excludeWarehouseId) {
  const rows = await prisma.stockBalance.findMany({
    where: {
      productId,
      qty: { gt: 0 },
      ...(excludeWarehouseId ? { warehouseId: { not: excludeWarehouseId } } : {}),
      warehouse: { isActive: true },
    },
    orderBy: { qty: "desc" },
    take: 20,
    select: {
      qty: true,
      warehouse: {
        select: {
          id: true,
          arName: true,
          enName: true,
          isMain: true,
          branches: {
            where: { isActive: true },
            select: { arName: true, enName: true },
          },
        },
      },
    },
  });
  return rows.map((r) => ({
    warehouseId: r.warehouse.id,
    arName: r.warehouse.arName,
    enName: r.warehouse.enName,
    isMain: r.warehouse.isMain,
    branches: r.warehouse.branches,
    qty: round4(n(r.qty)),
  }));
}
