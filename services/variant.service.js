import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertModule } from "@/lib/modules";
import { assertPlanLimit } from "@/lib/plan-limits";
import { runTx } from "@/lib/transaction";
import { getVisibleWarehouses, syncOpeningStock } from "./stock.service";
import { isHex, presetColor } from "@/lib/variant-colors";
import { can } from "@/lib/permissions";
import { bizRange } from "@/lib/business-day";
import { getDayStartHour } from "@/lib/business-day-server";
import { reportBranch } from "./report.service";
import {
  getBranchSaleContext,
  saleProductSelect,
  toSaleProduct,
} from "./sale-catalog.service";

// ============================================================
// المقاسات والألوان (وحدة variants: الملابس والأحذية)
// - الموديل (product_models) = الاسم المشترك
// - كل مقاس (ولون اختياري) صنف عادي جوه البرنامج: كود ورصيد وسعر مستقل
//   فالبيع والشراء والمرتجع والجرد والتحويل والضريبة شغالين من غير تعديل
// - التوليد من صنف موجود: الصنف نفسه بياخد أول مقاس، والباقي نسخ منه
//   الاسم: «الموديل - المقاس - اللون»، والكود: «كود الموديل-المقاس(-رقم اللون)»
// - التوليد تاني على نفس الموديل بيضيف المقاسات الجديدة بس (اللي موجود بيتساب)
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const MAX_COMBOS = 120;

// الحقول اللي بتتنسخ من الصنف للمقاسات الجديدة
const COPY_FIELDS = [
  "image",
  "cost",
  "price",
  "wholesalePrice",
  "taxRate",
  "isPriceIncludeTax",
  "taxCategory",
  "taxExemptionCode",
  "taxExemptionReason",
  "serialCount",
  "serialLabel1",
  "serialLabel2",
  "warrantyMonths",
  "warrantyType",
  "followUpDays",
  "changeKm",
  "changeMonths",
  "categoryId",
  "baseUnitId",
];

const sourceSelect = {
  id: true,
  code: true,
  arName: true,
  enName: true,
  isService: true,
  modelId: true,
  size: true,
  color: true,
  ...Object.fromEntries(COPY_FIELDS.map((f) => [f, true])),
  productUnits: {
    select: { unitId: true, conversionFactor: true, cost: true, price: true },
  },
  prices: { select: { priceListId: true, unitId: true, price: true } },
};

const clean = (list, max) =>
  [
    ...new Set(
      (list ?? [])
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .map((x) => x.slice(0, 30)),
    ),
  ].slice(0, max);

// الألوان: [{ name, hex }] ← من غير تكرار، والـ hex الغلط ← لون اللوحة بالاسم
const cleanColors = (list, max) => {
  const out = new Map();
  for (const c of list ?? []) {
    const name = String((typeof c === "string" ? c : c?.name) ?? "")
      .trim()
      .slice(0, 30);
    if (!name || out.has(name)) continue;
    const hex = isHex(c?.hex) ? c.hex.toLowerCase() : presetColor(name)?.hex;
    out.set(name, { name, hex: hex ?? null });
  }
  return [...out.values()].slice(0, max);
};

// الألوان المحفوظة (اللوحة الجاهزة + اللي التاجر ضافها)
export async function getVariantColors() {
  await assertModule("variants");
  const saved = await prisma.variantColor.findMany({
    orderBy: { id: "asc" },
    select: { arName: true, hex: true },
  });
  return saved;
}

const variantName = (base, size, color) =>
  [base, size, color].filter(Boolean).join(" - ").slice(0, 150);

// جزء الكود: المقاس لو حروف إنجليزي وأرقام (42 / XL)، وإلا رقم ترتيبه
const codePart = (value, index, prefix) =>
  /^[A-Za-z0-9.]+$/.test(value) ? value.toUpperCase() : `${prefix}${index + 1}`;

const keyOf = (size, color) => `${size ?? ""}|${color ?? ""}`;

// ------------------------------------------------------------
// المقاسات الحالية للصنف (نافذة المقاسات في شاشة الأصناف)
// ------------------------------------------------------------
export async function getProductVariants(productId, user) {
  await assertModule("variants");
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      code: true,
      arName: true,
      enName: true,
      isService: true,
      modelId: true,
      model: { select: { id: true, arName: true, enName: true, code: true } },
    },
  });
  if (!product) throw new AppError("ProductNotFound");
  if (!product.modelId) return { product, model: null, variants: [] };

  const warehouses = await getVisibleWarehouses(user);
  const rows = await prisma.product.findMany({
    where: { modelId: product.modelId },
    orderBy: { id: "asc" },
    select: {
      id: true,
      code: true,
      size: true,
      color: true,
      colorHex: true,
      price: true,
      isActive: true,
      stockBalances: {
        where: { warehouseId: { in: warehouses.map((w) => w.id) } },
        select: { qty: true },
      },
    },
  });
  return {
    product,
    model: product.model,
    variants: rows.map(({ stockBalances, ...v }) => ({
      ...v,
      price: n(v.price),
      stock:
        Math.round(stockBalances.reduce((s, b) => s + n(b.qty), 0) * 1000) /
        1000,
    })),
  };
}

// ------------------------------------------------------------
// توليد المقاسات (والألوان) من صنف
// ------------------------------------------------------------
// opening: { "المقاس|اللون": الرصيد الافتتاحي } للمقاسات اللي بتتعمل دلوقتي
export async function generateVariants(
  { productId, sizes, colors, opening },
  user,
) {
  await assertModule("variants");
  const sizeList = clean(sizes, 60);
  const colorList = cleanColors(colors, 20);
  if (!sizeList.length)
    throw new AppError("SizesRequired", null, { sizes: "SizesRequired" });

  const source = await prisma.product.findUnique({
    where: { id: productId },
    select: { ...sourceSelect, model: { select: { code: true } } },
  });
  if (!source) throw new AppError("ProductNotFound");
  if (source.isService) throw new AppError("VariantsNotForService");

  // كل المقاسات × كل الألوان (أو المقاسات بس)
  const combos = sizeList.flatMap((size, si) =>
    (colorList.length ? colorList : [null]).map((c, ci) => ({
      size,
      color: c?.name ?? null,
      colorHex: c?.hex ?? null,
      si,
      ci,
    })),
  );
  if (combos.length > MAX_COMBOS)
    throw new AppError("TooManyVariants", { max: MAX_COMBOS });

  // الموجود في الموديل من قبل ← بيتساب
  const existing = source.modelId
    ? await prisma.product.findMany({
        where: { modelId: source.modelId },
        select: { size: true, color: true },
      })
    : [];
  const taken = new Set(existing.map((e) => keyOf(e.size, e.color)));
  // الصنف نفسه من غير مقاس (أول توليد): بياخد أول مقاس
  const sourceGetsFirst = !source.size;
  const todo = combos.filter((c) => !taken.has(keyOf(c.size, c.color)));
  const toCreate = sourceGetsFirst ? todo.slice(1) : todo;
  if (!todo.length) return { created: 0, modelId: source.modelId };

  await assertPlanLimit("products", user, toCreate.length);

  // اسم الموديل: من الموديل لو موجود، وإلا اسم الصنف
  const model = source.modelId
    ? await prisma.productModel.findUnique({
        where: { id: source.modelId },
        select: { id: true, arName: true, enName: true, code: true },
      })
    : null;
  const baseAr = model?.arName ?? source.arName;
  const baseEn = model?.enName ?? source.enName;
  const baseCode = model?.code ?? source.code;

  // الأكواد: الكود-المقاس(-رقم اللون)، ولو متكرر نزود رقم
  const wanted = toCreate.map((c) =>
    `${baseCode}-${codePart(c.size, c.si, "S")}${
      c.color ? `-${codePart(c.color, c.ci, "C")}` : ""
    }`.slice(0, 46),
  );
  const [usedProducts, usedUnits] = await Promise.all([
    prisma.product.findMany({
      where: { code: { startsWith: `${baseCode}-` } },
      select: { code: true },
    }),
    prisma.productUnit.findMany({
      where: { barcode: { startsWith: `${baseCode}-` } },
      select: { barcode: true },
    }),
  ]);
  const used = new Set([
    ...usedProducts.map((p) => p.code),
    ...usedUnits.map((u) => u.barcode),
  ]);
  const codes = wanted.map((c) => {
    let code = c;
    for (let i = 2; used.has(code); i++) code = `${c}-${i}`;
    used.add(code);
    return code;
  });

  const copy = Object.fromEntries(COPY_FIELDS.map((f) => [f, source[f]]));
  const units = source.productUnits.map((u) => ({
    unitId: u.unitId,
    conversionFactor: u.conversionFactor,
    cost: u.cost,
    price: u.price,
  }));

  const ids = [];
  const result = await runTx(
    async (tx) => {
      ids.length = 0;
      const modelId =
        model?.id ??
        (
          await tx.productModel.create({
            data: { arName: baseAr, enName: baseEn, code: baseCode },
            select: { id: true },
          })
        ).id;

      if (sourceGetsFirst) {
        const first = todo[0];
        await tx.product.update({
          where: { id: source.id },
          data: {
            modelId,
            size: first.size,
            color: first.color,
            colorHex: first.colorHex,
            arName: variantName(baseAr, first.size, first.color),
            enName: variantName(baseEn, first.size, first.color),
          },
        });
      }

      for (let i = 0; i < toCreate.length; i++) {
        const c = toCreate[i];
        const created = await tx.product.create({
          data: {
            ...copy,
            code: codes[i],
            arName: variantName(baseAr, c.size, c.color),
            enName: variantName(baseEn, c.size, c.color),
            isActive: true,
            modelId,
            size: c.size,
            color: c.color,
            colorHex: c.colorHex,
            productUnits: { create: units },
          },
          select: { id: true },
        });
        ids.push(created.id);
        // أسعار قوائم الأسعار زي الصنف الأصلي
        if (source.prices.length) {
          await tx.productPrice.createMany({
            data: source.prices.map((p) => ({
              priceListId: p.priceListId,
              unitId: p.unitId,
              price: p.price,
              productId: created.id,
            })),
          });
        }
      }
      return { created: toCreate.length + (sourceGetsFirst ? 1 : 0), modelId };
    },
    { timeout: 30_000 },
  );

  // الألوان اللي مش في اللوحة الجاهزة ← تتحفظ للمرة الجاية
  for (const c of colorList) {
    if (!c.hex || presetColor(c.name)) continue;
    await prisma.variantColor.upsert({
      where: { arName: c.name },
      create: { arName: c.name, hex: c.hex },
      update: { hex: c.hex },
    });
  }

  // الرصيد الافتتاحي لكل مقاس (على المستودع الرئيسي، بتكلفة الصنف)
  const openingOf = (c) => Number(opening?.[keyOf(c.size, c.color)]) || 0;
  const targets = [
    ...(sourceGetsFirst ? [{ id: source.id, combo: todo[0] }] : []),
    ...toCreate.map((c, i) => ({ id: ids[i], combo: c })),
  ];
  for (const { id, combo } of targets) {
    const qty = openingOf(combo);
    if (qty <= 0) continue;
    const units = await prisma.productUnit.findMany({
      where: { productId: id },
      select: { startStock: true, conversionFactor: true },
    });
    const extra = units.reduce(
      (s, u) => s + n(u.startStock) * n(u.conversionFactor),
      0,
    );
    await prisma.product.update({ where: { id }, data: { startStock: qty } });
    await syncOpeningStock(id, qty + extra, n(source.cost));
  }
  return result;
}

// ------------------------------------------------------------
// سعر بيع واحد لكل مقاسات الموديل (الوحدة الأساسية)
// ------------------------------------------------------------
export async function setModelPrice({ modelId, price }) {
  await assertModule("variants");
  const { count } = await prisma.product.updateMany({
    where: { modelId },
    data: { price },
  });
  if (!count) throw new AppError("NotFound");
  return { updated: count };
}

// ------------------------------------------------------------
// الكاشير / فاتورة البيع: كل مقاسات الموديل (برصيد مستودع الفرع)
// ------------------------------------------------------------
export async function getSaleModelVariants(modelId, user) {
  await assertModule("variants");
  const ctx = await getBranchSaleContext(user.branch.id);
  const [model, rows] = await Promise.all([
    prisma.productModel.findUnique({
      where: { id: modelId },
      select: { id: true, arName: true, enName: true },
    }),
    prisma.product.findMany({
      where: { modelId, isActive: true },
      orderBy: { id: "asc" },
      select: saleProductSelect(ctx),
    }),
  ]);
  if (!model) throw new AppError("NotFound");
  return { model, variants: rows.map((p) => toSaleProduct(p)) };
}

// ------------------------------------------------------------
// تقرير الموديلات: المبيعات (صافي بعد المرتجع) والرصيد مجمّع بالموديل
// ومفصّل بالمقاس، للفترة والفرع (بأيام العمل زي تقرير المبيعات)
// الرصيد الحالي: مستودع الفرع المختار، وإلا كل المستودعات اللي المستخدم يشوفها
// ------------------------------------------------------------
export async function modelsReport(f, user) {
  await assertModule("variants");
  const h = await getDayStartHour();
  const saleWhere = { date: bizRange(f, h), ...reportBranch(user, f.branchId) };
  const showProfit = can(user, "reports.profit");

  // المستودعات للرصيد
  let warehouseIds = (await getVisibleWarehouses(user)).map((w) => w.id);
  if (f.branchId) {
    const b = await prisma.branch.findUnique({
      where: { id: f.branchId },
      select: { warehouseId: true },
    });
    if (b?.warehouseId) warehouseIds = [b.warehouseId];
  }

  const itemWhere = (type) => ({
    sale: { ...saleWhere, type },
    product: { modelId: { not: null } },
  });
  const sums = { baseQty: true, netAmount: true, costAmount: true };
  const [sold, returned, models] = await Promise.all([
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: itemWhere("sale"),
      _sum: sums,
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: itemWhere("return"),
      _sum: sums,
    }),
    prisma.productModel.findMany({
      orderBy: { arName: "asc" },
      select: {
        id: true,
        code: true,
        arName: true,
        enName: true,
        products: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            code: true,
            size: true,
            color: true,
            stockBalances: {
              where: { warehouseId: { in: warehouseIds } },
              select: { qty: true },
            },
          },
        },
      },
    }),
  ]);

  const moves = new Map();
  const addMove = (rows, sign) => {
    for (const r of rows) {
      const m = moves.get(r.productId) ?? { qty: 0, net: 0, cost: 0 };
      m.qty += sign * n(r._sum.baseQty);
      m.net += sign * n(r._sum.netAmount);
      m.cost += sign * n(r._sum.costAmount);
      moves.set(r.productId, m);
    }
  };
  addMove(sold, 1);
  addMove(returned, -1);

  const r3 = (v) => Math.round(v * 1000) / 1000;
  const r2 = (v) => Math.round(v * 100) / 100;
  const rows = models
    .map((m) => {
      const sizes = m.products.map((p) => {
        const mv = moves.get(p.id) ?? { qty: 0, net: 0, cost: 0 };
        return {
          id: p.id,
          code: p.code,
          size: p.size,
          color: p.color,
          qty: r3(mv.qty),
          net: r2(mv.net),
          ...(showProfit ? { profit: r2(mv.net - mv.cost) } : {}),
          stock: r3(p.stockBalances.reduce((s, b) => s + n(b.qty), 0)),
        };
      });
      const sum = (k) => sizes.reduce((s, x) => s + (x[k] ?? 0), 0);
      return {
        id: m.id,
        code: m.code,
        arName: m.arName,
        enName: m.enName,
        qty: r3(sum("qty")),
        net: r2(sum("net")),
        ...(showProfit ? { profit: r2(sum("profit")) } : {}),
        stock: r3(sum("stock")),
        sizes,
      };
    })
    // موديل من غير مقاسات (اتمسحت) ← مالوش لازمة
    .filter((m) => m.sizes.length)
    .sort((a, b) => b.net - a.net || a.arName.localeCompare(b.arName));

  const total = (k) => rows.reduce((s, x) => s + (x[k] ?? 0), 0);
  return {
    rows,
    totals: {
      models: rows.length,
      qty: r3(total("qty")),
      net: r2(total("net")),
      ...(showProfit ? { profit: r2(total("profit")) } : {}),
      stock: r3(total("stock")),
    },
  };
}
