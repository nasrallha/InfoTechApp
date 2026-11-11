import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { hasFeature } from "@/lib/plan-features";
import { hasModule } from "@/lib/modules";
import { assertPlanLimit } from "@/lib/plan-limits";
import { phoneRule } from "@/lib/phone";
import { dayToDbDate } from "@/lib/dates";
import { EXEMPTION_CODES } from "@/lib/zatca-tax";
import { canAllBranches, resolvePartyBranches } from "@/lib/party-scope";
import {
  IMPORT_FIELDS,
  enabledFields,
  cellText,
  cellNumber,
  cellBool,
  cellDate,
} from "@/lib/import-fields";
import {
  createProductSchema,
  updateProductSchema,
} from "@/validations/product.schema";
import {
  createCustomerSchema,
  updateCustomerSchema,
  createPartySchema,
  updatePartySchema,
  customerB2BIssues,
} from "@/validations/party.schema";
import {
  findOrCreate,
  nextProductCode,
  updateProduct,
  withoutDisabledFields,
  serviceDefaults,
} from "./product.service";
import {
  getMainWarehouseId,
  getVisibleWarehouses,
  userWarehouseId,
} from "./stock.service";
import { createUnitSchema, updateUnitSchema } from "@/validations/unit.schema";
import {
  createCategorySchema,
  updateCategorySchema,
} from "@/validations/category.schema";
import { createUnit, updateUnit } from "./unit.service";
import { createCategory, updateCategory } from "./category.service";
import { updateCustomer } from "./customer.service";
import { updateSupplier } from "./supplier.service";
import { isZatcaActive } from "./zatca.service";
import { getBaseCurrency } from "./currency.service";
import { getSystemSettings } from "./system-settings.service";

// ============================================================
// الاستيراد من Excel (الأصناف والعملاء والموردين)
// - الواجهة بتقرا الملف وبتبعت الصفوف على دفعات: { r: رقم الصف، v: [[الحقل، القيمة]]، d: الحقول المكررة في الملف }
// - check: فحص من غير حفظ ← حالة كل صف (جديد / تحديث / موجود / خطأ)
// - run: نفس الفحص ثم الحفظ:
//   الجديد على دفعات (createMany) بنفس قواعد الفورم، والتحديث صف صف بخدمة التعديل نفسها
// - الحقول الفاضية في التحديث: متتغيرش
// ============================================================

// قسم / وحدة افتراضي للصنف اللي مالوش (البقالة: أصناف كتير من غير مجموعة)
const DEFAULT_CATEGORY = ["عام", "General"];
const DEFAULT_UNIT = ["حبة", "Piece"];
// رقم مؤقت للقسم/الوحدة اللي هيتعملوا (في الفحص بس)
const PENDING_ID = 2_000_000_000;

const normName = (s) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
// نسخة من الكائن من غير حقول معيّنة
const omit = (obj, keys) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
const round4 = (v) => Math.round((Number(v) + Number.EPSILON) * 1e4) / 1e4;

// الوحدات / المميزات المفعّلة للشركة (الاشتراك متخزن للطلب كله)
async function gateChecker() {
  const gates = new Map();
  for (const f of Object.values(IMPORT_FIELDS).flat()) {
    if (!f.gate) continue;
    const k = JSON.stringify(f.gate);
    if (gates.has(k)) continue;
    gates.set(
      k,
      f.gate.module
        ? await hasModule(f.gate.module)
        : await hasFeature(f.gate.feature),
    );
  }
  return (g) => gates.get(JSON.stringify(g)) ?? false;
}

// صلاحية الاستيراد لنوع معيّن
export function assertImportAllowed(kind, user) {
  if (!can(user, `${kind}.import`)) throw new AppError("Forbidden");
}

// ------------------------------------------------------------
// تجهيز شاشة الاستيراد: الحقول المفعّلة + القوائم (للنموذج والاختيارات)
// ------------------------------------------------------------
export async function importSetup(kind, user) {
  const isOn = await gateChecker();
  const fields = enabledFields(kind, isOn).map((f) => ({
    key: f.key,
    type: f.type,
    required: Boolean(f.required),
    aliases: f.aliases ?? [],
  }));
  const names = { select: { id: true, arName: true, enName: true } };
  if (kind === "products") {
    const all = can(user, "allBranches.view");
    const [categories, units, warehouses] = await Promise.all([
      prisma.category.findMany({ where: { isActive: true }, ...names }),
      prisma.unit.findMany({ where: { isActive: true }, ...names }),
      all ? getVisibleWarehouses(user) : [],
    ]);
    return {
      fields,
      categories,
      units,
      // اختيار مستودع الرصيد الافتتاحي: للمدير لو فيه أكتر من مستودع
      warehouses: warehouses
        .filter((w) => w.isActive !== false)
        .map((w) => ({
          id: w.id,
          arName: w.arName,
          enName: w.enName,
          isMain: w.isMain,
        })),
    };
  }
  if (kind === "units" || kind === "categories") return { fields };
  return {
    fields,
    // الإتاحة في الفروع: لصاحب "عرض كل الفروع" بس
    branches: canAllBranches(user)
      ? await prisma.branch.findMany({ orderBy: { id: "asc" }, ...names })
      : null,
  };
}

// قيم الصف ← الأنواع الصحيحة + أخطاء التحويل
function readRow(fields, pairs) {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out = {};
  const errors = [];
  for (const [key, raw] of pairs ?? []) {
    const f = byKey.get(key);
    if (!f) continue;
    let v;
    if (f.type === "number") {
      v = cellNumber(raw);
      if (Number.isNaN(v)) errors.push({ field: key, code: "ImportBadNumber" });
    } else if (f.type === "bool") {
      v = cellBool(raw);
      if (v === null) errors.push({ field: key, code: "ImportBadBool" });
    } else if (f.type === "date") {
      v = cellDate(raw);
      if (v === null) errors.push({ field: key, code: "ImportBadDate" });
    } else {
      v = cellText(raw);
      if (v === "") v = undefined;
    }
    if (v !== undefined && v !== null && !Number.isNaN(v)) out[key] = v;
  }
  return { values: out, errors };
}

// أخطاء Zod ← { field, code } بأسماء أعمدة الاستيراد
function zodErrors(issues, mapPath) {
  const seen = new Set();
  const out = [];
  for (const issue of issues) {
    const field = mapPath(issue.path);
    if (seen.has(field)) continue;
    seen.add(field);
    out.push({ field, code: issue.message || "ValidationError" });
  }
  return out;
}

// ============================================================
// الأصناف
// ============================================================

const PRODUCT_EXIST_SELECT = {
  id: true,
  code: true,
  arName: true,
  enName: true,
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
  trackExpiry: true,
  expiryAlertDays: true,
  serialCount: true,
  serialLabel1: true,
  serialLabel2: true,
  warrantyMonths: true,
  warrantyType: true,
  followUpDays: true,
  changeKm: true,
  changeMonths: true,
  durationMin: true,
  categoryId: true,
  baseUnitId: true,
  productUnits: {
    select: {
      unitId: true,
      conversionFactor: true,
      barcode: true,
      cost: true,
      price: true,
      startStock: true,
    },
  },
};

// الصنف الموجود ← نفس شكل بيانات فورم التعديل
const num = (v) => (v == null ? 0 : Number(v));
const existingInput = (p) => ({
  ...p,
  cost: num(p.cost),
  price: num(p.price),
  wholesalePrice: num(p.wholesalePrice),
  taxRate: num(p.taxRate),
  startStock: num(p.startStock),
  productUnits: undefined,
  units: p.productUnits.map((u) => ({
    unitId: u.unitId,
    conversionFactor: num(u.conversionFactor),
    barcode: u.barcode,
    cost: num(u.cost),
    price: num(u.price),
    startStock: num(u.startStock),
  })),
});

// الحقول اللي بتتنقل من الصف للصنف زي ما هي
const PRODUCT_SIMPLE = [
  "code",
  "arName",
  "enName",
  "price",
  "cost",
  "wholesalePrice",
  "taxRate",
  "isPriceIncludeTax",
  "startStock",
  "isService",
  "isActive",
  "trackExpiry",
  "expiryAlertDays",
  "serialCount",
  "warrantyMonths",
  "followUpDays",
  "changeKm",
  "changeMonths",
  "durationMin",
];

// السياق (مرة واحدة لكل طلب): الإعدادات والأقسام والوحدات والمستودعات
async function productContext(user, options) {
  const [settings, categories, units, isOn, mainId] = await Promise.all([
    getSystemSettings(),
    prisma.category.findMany({ select: { id: true, arName: true, enName: true } }),
    prisma.unit.findMany({ select: { id: true, arName: true, enName: true } }),
    gateChecker(),
    getMainWarehouseId(),
  ]);
  const toMap = (list) => {
    const m = new Map();
    for (const x of list) {
      m.set(normName(x.enName), x.id);
      m.set(normName(x.arName), x.id);
    }
    return m;
  };
  const all = can(user, "allBranches.view");
  const own = all ? null : await userWarehouseId(user);
  // مستودع الرصيد الافتتاحي: المدير بيختار (افتراضي الرئيسي)، والموظف: مستودع فرعه
  let target = mainId;
  if (all && options.warehouseId) {
    const visible = await getVisibleWarehouses(user);
    if (!visible.some((w) => w.id === options.warehouseId))
      throw new AppError("WarehouseNotFound");
    target = options.warehouseId;
  } else if (!all) target = own ?? mainId;
  return {
    settings,
    fields: enabledFields("products", isOn),
    catMap: toMap(categories),
    unitMap: toMap(units),
    all,
    own,
    mainId,
    target,
  };
}

// كل الأسماء (أقسام / وحدات) في الصفوف
// + هل فيه صنف جديد محتاج القسم / الوحدة الافتراضية (مالوش قسم أو وحدة)
function refNames(rows, ctx) {
  const cats = new Set();
  const units = new Set();
  let noCat = false;
  let noUnit = false;
  for (const r of rows) {
    const { values: v } = readRow(ctx.fields, r.v);
    if (v.category) cats.add(v.category);
    else if (!v.isService) noCat = true;
    for (const k of ["unit", "unit2", "unit3"]) if (v[k]) units.add(v[k]);
    if (!v.unit && !v.isService) noUnit = true;
  }
  return { cats, units, noCat, noUnit };
}

// فحص صفوف الأصناف ← الحالة والأخطاء لكل صف + البيانات الجاهزة للحفظ
async function prepareProducts(rows, ctx, options) {
  const read = rows.map((r) => ({
    row: r.r,
    dup: r.d ?? [],
    ...readRow(ctx.fields, r.v),
  }));
  const codes = [...new Set(read.map((x) => x.values.code).filter(Boolean))];
  const existing = codes.length
    ? await prisma.product.findMany({
        where: { code: { in: codes } },
        select: PRODUCT_EXIST_SELECT,
      })
    : [];
  const exByCode = new Map(existing.map((p) => [p.code, p]));

  const pendingCats = new Set();
  const pendingUnits = new Set();
  const ref = (map, pending, name) => {
    const id = map.get(normName(name));
    if (id) return id;
    pending.add(name.trim());
    return PENDING_ID;
  };
  const defaultRef = (map, pending, [ar, en]) =>
    map.get(normName(ar)) ?? map.get(normName(en)) ?? (pending.add(ar), PENDING_ID);

  const results = [];
  const items = [];
  for (const x of read) {
    const v = x.values;
    const errors = [
      ...x.errors,
      ...x.dup.map((field) => ({ field, code: "ImportDupInFile" })),
    ];
    const ex = v.code ? exByCode.get(v.code) : null;
    if (ex && !options.updateExisting) {
      results.push({ row: x.row, status: "skip", errors: [] });
      continue;
    }

    const input = ex
      ? existingInput(ex)
      : {
          code: "",
          arName: "",
          enName: "",
          cost: 0,
          price: 0,
          wholesalePrice: 0,
          taxRate: num(ctx.settings.taxRate),
          isPriceIncludeTax: Boolean(ctx.settings.productPriceIncludesTax),
          startStock: 0,
          isActive: true,
          isService: false,
          trackExpiry: false,
          units: [],
        };
    for (const k of PRODUCT_SIMPLE) if (v[k] !== undefined) input[k] = v[k];
    if (!ex && !input.enName) input.enName = input.arName;
    // تاريخ انتهاء للرصيد الافتتاحي ← الصنف متتبع بالصلاحية
    if (!ex && v.expDate && v.trackExpiry === undefined) input.trackExpiry = true;

    // القسم والوحدة: بالاسم، والفاضي ← الافتراضي (الخدمة: «خدمات» / «خدمة» تلقائي)
    if (v.category) input.categoryId = ref(ctx.catMap, pendingCats, v.category);
    else if (!ex && !input.isService)
      input.categoryId = defaultRef(ctx.catMap, pendingCats, DEFAULT_CATEGORY);
    if (v.unit) input.baseUnitId = ref(ctx.unitMap, pendingUnits, v.unit);
    else if (!ex && !input.isService)
      input.baseUnitId = defaultRef(ctx.unitMap, pendingUnits, DEFAULT_UNIT);

    // الضريبة صفر: فئة «خارج النطاق» وأول سبب (زي الفورم) لو مش متحددة
    if (!(Number(input.taxRate) > 0)) {
      if (!["Z", "E", "O"].includes(input.taxCategory)) input.taxCategory = "O";
      const list = EXEMPTION_CODES[input.taxCategory].map((c) => c.code);
      if (!list.includes(input.taxExemptionCode))
        input.taxExemptionCode = list[0] ?? null;
    }

    // الوحدات الإضافية (2 و 3): الموجودة بتتعدل، والجديدة بتتضاف
    const unitCol = []; // رقم عمود كل وحدة (لرسائل الخطأ)
    input.units = [...input.units];
    for (const n of [2, 3]) {
      const has = ["unit", "factor", "barcode", "price"].some(
        (k) => v[`${k}${n}`] !== undefined,
      );
      if (!has) continue;
      if (!v[`unit${n}`]) {
        errors.push({ field: `unit${n}`, code: "RequiredField" });
        continue;
      }
      const unitId = ref(ctx.unitMap, pendingUnits, v[`unit${n}`]);
      const i = input.units.findIndex((u) => u.unitId === unitId);
      const cur = i >= 0 ? input.units[i] : null;
      const u = {
        unitId,
        conversionFactor: v[`factor${n}`] ?? cur?.conversionFactor,
        barcode: v[`barcode${n}`] ?? cur?.barcode ?? null,
        cost: cur?.cost ?? 0,
        price: v[`price${n}`] ?? cur?.price ?? 0,
        startStock: cur?.startStock ?? 0,
      };
      if (i >= 0) {
        input.units[i] = u;
        unitCol[i] = n;
      } else {
        unitCol[input.units.length] = n;
        input.units.push(u);
      }
    }

    // نفس قواعد الفورم بالظبط
    const schema = ex ? updateProductSchema : createProductSchema;
    const parsed = schema.safeParse({
      ...input,
      image: null,
      ...(ex ? { id: ex.id, removeImage: false } : {}),
    });
    if (!parsed.success) {
      errors.push(
        ...zodErrors(parsed.error.issues, (path) => {
          const [a, i, b] = path;
          if (a === "categoryId") return "category";
          if (a === "baseUnitId") return "unit";
          if (a === "taxCategory" || a === "taxExemptionCode") return "taxRate";
          if (a === "units") {
            const n = unitCol[i] ?? 2;
            const col = {
              unitId: "unit",
              conversionFactor: "factor",
              barcode: "barcode",
              price: "price",
            }[b];
            return `${col ?? "unit"}${n}`;
          }
          return String(a ?? "arName");
        }),
      );
    }
    if (errors.length) {
      results.push({ row: x.row, status: "error", errors });
      continue;
    }
    const item = {
      row: x.row,
      ex,
      data: parsed.data,
      expDate: ex ? null : (v.expDate ?? null),
    };
    items.push(item);
    results.push({ row: x.row, status: ex ? "update" : "new", errors: [] });
  }

  // التكرار مع البرنامج: الكود والباركودات + الاسم في نفس القسم
  await productConflicts(items, results);

  return {
    results,
    items: items.filter((it) => !it.failed),
    creates: { categories: [...pendingCats], units: [...pendingUnits] },
  };
}

async function productConflicts(items, results) {
  if (!items.length) return;
  const fail = (it, field, code) => {
    it.failed = true;
    const r = results.find((x) => x.row === it.row);
    r.status = "error";
    r.errors.push({ field, code });
  };
  const codesOf = (it) => [
    ...(it.data.code ? [{ field: "code", value: it.data.code }] : []),
    ...it.data.units
      .map((u, i) => ({ field: `barcode${i + 2}`, value: u.barcode }))
      .filter((b) => b.value),
  ];
  const all = [...new Set(items.flatMap((it) => codesOf(it).map((c) => c.value)))];
  const names = [
    ...new Set(items.flatMap((it) => [it.data.arName, it.data.enName])),
  ];
  const [prods, units, sameNames] = await Promise.all([
    all.length
      ? prisma.product.findMany({
          where: { code: { in: all } },
          select: { id: true, code: true },
        })
      : [],
    all.length
      ? prisma.productUnit.findMany({
          where: { barcode: { in: all } },
          select: { productId: true, barcode: true },
        })
      : [],
    prisma.product.findMany({
      where: { OR: [{ arName: { in: names } }, { enName: { in: names } }] },
      select: { id: true, arName: true, enName: true, categoryId: true },
    }),
  ]);
  const owner = new Map();
  for (const p of prods) owner.set(p.code, p.id);
  for (const u of units) owner.set(u.barcode, u.productId);

  // الاسم في نفس القسم (جوه الدفعة كمان)
  const seenNames = new Map();
  for (const it of items) {
    const selfId = it.ex?.id ?? null;
    for (const c of codesOf(it)) {
      const o = owner.get(c.value);
      // باركود وحدة إضافية = كود نفس الصنف: ممنوع برضه
      if ((o && o !== selfId) || (c.field !== "code" && c.value === it.data.code)) {
        fail(it, c.field, "BarcodeExists");
        break;
      }
    }
    if (it.failed) continue;
    const cat = it.data.categoryId;
    const clash = sameNames.find(
      (p) =>
        p.id !== selfId &&
        p.categoryId === cat &&
        (p.arName === it.data.arName || p.enName === it.data.enName),
    );
    const key = (n) => `${cat}|${normName(n)}`;
    if (
      clash ||
      seenNames.has(key(it.data.arName)) ||
      seenNames.has(key(it.data.enName))
    ) {
      fail(it, "arName", "ProductNameInCategoryShort");
      continue;
    }
    seenNames.set(key(it.data.arName), it.row);
    seenNames.set(key(it.data.enName), it.row);
  }
}

export async function checkProducts(rows, user, options) {
  const ctx = await productContext(user, options);
  const { results, creates } = await prepareProducts(rows, ctx, options);
  return { results, creates };
}

// أكواد تلقائية للأصناف الجديدة (زي الفورم: الرقم اللي بعد أكبر كود، ومش مستخدم كباركود)
async function assignCodes(list) {
  const need = list.filter((p) => !p.data.code);
  if (!need.length) return;
  const taken = new Set(
    list.flatMap((p) => [p.data.code, ...p.units.map((u) => u.barcode)]).filter(Boolean),
  );
  let next = Number(await nextProductCode());
  for (let guard = 0; guard < 20 && need.some((p) => !p.data.code); guard++) {
    const left = need.filter((p) => !p.data.code);
    const cand = [];
    while (cand.length < left.length) {
      const c = String(next++);
      if (!taken.has(c)) cand.push(c);
    }
    const [a, b] = await Promise.all([
      prisma.product.findMany({ where: { code: { in: cand } }, select: { code: true } }),
      prisma.productUnit.findMany({
        where: { barcode: { in: cand } },
        select: { barcode: true },
      }),
    ]);
    const used = new Set([...a.map((x) => x.code), ...b.map((x) => x.barcode)]);
    let i = 0;
    for (const c of cand) {
      taken.add(c);
      if (!used.has(c)) left[i++].data.code = c;
    }
  }
}

// الإضافة على دفعة واحدة (نفس نتيجة createProduct لكل صنف)
async function createProductsBulk(items, ctx) {
  const list = [];
  for (const it of items) {
    // الوحدات المقفولة عند الشركة + الخدمة (الوحدة «خدمة» والقسم «خدمات»)
    const cleaned = await withoutDisabledFields(it.data);
    const { data: d, units } = await serviceDefaults(cleaned, cleaned.units);
    const data = omit(d, [
      "image",
      "units",
      "stores",
      "allWarehouses",
      "removeImage",
    ]);
    list.push({
      row: it.row,
      data,
      units: units.map((u) => ({ ...u, startStock: 0 })),
      qty: Math.round((Number(data.startStock) || 0) * 1000) / 1000,
      expDate: it.expDate,
    });
  }
  await assignCodes(list);

  const toMain = ctx.target === ctx.mainId;
  // موظف فرع مستودعه مش الرئيسي: الصنف بيتقفل على مستودعه (زي الفورم)
  const limited = !ctx.all && ctx.own && ctx.own !== ctx.mainId;
  for (const p of list) {
    p.data.startStock = toMain ? p.qty : 0;
    if (limited) p.data.allWarehouses = false;
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.product.createMany({ data: list.map((p) => p.data) });
      const ids = await tx.product.findMany({
        where: { code: { in: list.map((p) => p.data.code) } },
        select: { id: true, code: true },
      });
      const idOf = new Map(ids.map((x) => [x.code, x.id]));
      for (const p of list) p.id = idOf.get(p.data.code);

      const units = list.flatMap((p) =>
        p.units.map((u) => ({ ...u, productId: p.id })),
      );
      if (units.length) await tx.productUnit.createMany({ data: units });

      // المستودعات: رصيد مستودع غير الرئيسي في جدول المستودعات (زي جدول الفورم)
      const pw = list
        .filter((p) => limited || (!toMain && p.qty > 0))
        .map((p) => ({
          productId: p.id,
          warehouseId: ctx.target,
          openingQty: toMain ? 0 : p.qty,
        }));
      if (pw.length) await tx.productWarehouse.createMany({ data: pw });

      // الرصيد الافتتاحي ← حركة opening + الرصيد (+ الدفعة للمتتبع بالصلاحية)
      const stocked = list.filter((p) => p.qty > 0 && !p.data.isService);
      if (!stocked.length) return;
      const now = new Date();
      await tx.stockMovement.createMany({
        data: stocked.map((p) => ({
          productId: p.id,
          warehouseId: ctx.target,
          qty: p.qty,
          cost: round4(p.data.cost ?? 0),
          type: "opening",
          refType: "product",
          refId: p.id,
          date: now,
        })),
      });
      await tx.stockBalance.createMany({
        data: stocked.map((p) => ({
          productId: p.id,
          warehouseId: ctx.target,
          qty: p.qty,
        })),
      });
      const tracked = stocked.filter((p) => p.data.trackExpiry);
      if (tracked.length)
        await tx.productBatch.createMany({
          data: tracked.map((p) => ({
            productId: p.id,
            warehouseId: ctx.target,
            batchNo: p.expDate ? `E${p.expDate.replaceAll("-", "")}` : "-",
            expDate: p.expDate ? dayToDbDate(p.expDate) : null,
            qty: p.qty,
          })),
        });
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
  return list.length;
}

export async function runProducts(rows, user, options) {
  let ctx = await productContext(user, options);
  // الأقسام والوحدات اللي مش موجودة بتتعمل الأول (بالاسم العربي والإنجليزي نفسه)
  const { cats, units, noCat, noUnit } = refNames(rows, ctx);
  let made = false;
  for (const name of cats)
    if (!ctx.catMap.has(normName(name))) {
      await findOrCreate("category", name.trim(), name.trim());
      made = true;
    }
  for (const name of units)
    if (!ctx.unitMap.has(normName(name))) {
      await findOrCreate("unit", name.trim(), name.trim());
      made = true;
    }
  // الافتراضي (عام / حبة): بيتعمل بس لو فيه صنف مالوش قسم أو وحدة
  // (الصنف الموجود مالوش قسم في الملف ← قسمه بيفضل زي ما هو)
  const [ar, en] = DEFAULT_CATEGORY;
  if (noCat && !ctx.catMap.has(normName(ar)) && !ctx.catMap.has(normName(en))) {
    await findOrCreate("category", ar, en);
    made = true;
  }
  const [uar, uen] = DEFAULT_UNIT;
  if (noUnit && !ctx.unitMap.has(normName(uar)) && !ctx.unitMap.has(normName(uen))) {
    await findOrCreate("unit", uar, uen);
    made = true;
  }
  if (made) ctx = await productContext(user, options);

  const { results, items } = await prepareProducts(rows, ctx, options);
  const creates = items.filter((it) => !it.ex);
  const updates = items.filter((it) => it.ex);

  // حد الأصناف في الباقة
  if (creates.length) await assertPlanLimit("products", user, creates.length);

  let added = 0;
  if (creates.length) {
    try {
      added = await createProductsBulk(creates, ctx);
    } catch (error) {
      // تكرار في نفس اللحظة (حد ضاف نفس الكود): الدفعة كلها بترجع
      if (error?.code !== "P2002") throw error;
      for (const it of creates) {
        const r = results.find((x) => x.row === it.row);
        r.status = "error";
        r.errors.push({ field: "code", code: "BarcodeExists" });
      }
    }
  }

  // التحديث: صف صف بخدمة التعديل نفسها (الوحدات والرصيد الافتتاحي والدفعات)
  let updated = 0;
  for (const it of updates) {
    try {
      await updateProduct(it.data, user);
      updated++;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      const r = results.find((x) => x.row === it.row);
      r.status = "error";
      r.errors.push({
        field: Object.keys(error.fieldErrors ?? {})[0] ?? "code",
        code:
          error.code === "ProductNameInCategory"
            ? "ProductNameInCategoryShort"
            : error.code,
      });
    }
  }
  return { results, added, updated };
}

// ============================================================
// العملاء والموردين
// ============================================================

const PARTY = {
  customers: {
    model: "customer",
    branchModel: "customerBranch",
    fk: "customerId",
    create: createCustomerSchema,
    update: updateCustomerSchema,
    save: updateCustomer,
  },
  suppliers: {
    model: "supplier",
    branchModel: "supplierBranch",
    fk: "supplierId",
    create: createPartySchema,
    update: updatePartySchema,
    save: updateSupplier,
  },
};

const PARTY_KEYS = [
  "arName",
  "enName",
  "phone",
  "taxNo",
  "registrationNo",
  "countryCode",
  "idScheme",
  "idNumber",
  "city",
  "district",
  "street",
  "buildingNo",
  "additionalNo",
  "postalCode",
  "openingBalance",
  "isActive",
];

// الجوال من Excel: الصفر اللي في الأول بيضيع لو الخلية رقم، و+966 / 00966
function fixPhone(phone, rule) {
  let p = String(phone).replace(/[\s-]/g, "");
  if (rule.error === "PhoneInvalidSA") {
    p = p.replace(/^(\+|00)?966/, "0");
    if (/^5\d{8}$/.test(p)) p = `0${p}`;
  } else if (rule.error === "PhoneInvalidEG") {
    p = p.replace(/^(\+|00)?20(?=1)/, "0");
    if (/^1[0125]\d{8}$/.test(p)) p = `0${p}`;
  }
  return p;
}

async function prepareParties(kind, rows, user, options) {
  const cfg = PARTY[kind];
  const model = prisma[cfg.model];
  const fields = IMPORT_FIELDS[kind];
  const rule = phoneRule((await getBaseCurrency())?.code);
  const zatca =
    kind === "customers" ? await isZatcaActive(user?.branch?.id) : false;

  const read = rows.map((r) => {
    const x = { row: r.r, dup: r.d ?? [], ...readRow(fields, r.v) };
    if (x.values.phone) x.values.phone = fixPhone(x.values.phone, rule);
    if (x.values.idScheme) x.values.idScheme = x.values.idScheme.toUpperCase();
    if (x.values.countryCode)
      x.values.countryCode = x.values.countryCode.toUpperCase();
    return x;
  });

  // الموجود: بالكود ← الرقم الضريبي ← الجوال ← السجل / المعرّف
  const pick = (k) => [...new Set(read.map((x) => x.values[k]).filter(Boolean))];
  const codes = pick("code")
    .map((c) => Number(c))
    .filter((c) => Number.isInteger(c) && c > 0);
  const or = [
    codes.length && { code: { in: codes } },
    pick("taxNo").length && { taxNo: { in: pick("taxNo") } },
    pick("phone").length && { phone: { in: pick("phone") } },
    kind === "suppliers" &&
      pick("registrationNo").length && {
        registrationNo: { in: pick("registrationNo") },
      },
    kind === "customers" &&
      pick("idNumber").length && { idNumber: { in: pick("idNumber") } },
  ].filter(Boolean);
  const extra =
    kind === "customers"
      ? { countryCode: true, idScheme: true, idNumber: true }
      : { registrationNo: true };
  const existing = or.length
    ? await model.findMany({
        where: { OR: or },
        select: {
          id: true,
          code: true,
          arName: true,
          enName: true,
          phone: true,
          taxNo: true,
          city: true,
          district: true,
          street: true,
          buildingNo: true,
          additionalNo: true,
          postalCode: true,
          openingBalance: true,
          isActive: true,
          allBranches: true,
          branches: { select: { branchId: true } },
          ...extra,
        },
      })
    : [];
  const visible = (p) =>
    canAllBranches(user) ||
    p.allBranches ||
    p.branches.some((b) => b.branchId === user.branch.id);

  const UNIQUE = [
    ["phone", "PhoneExists"],
    ["taxNo", "TaxNoExists"],
    ...(kind === "suppliers" ? [["registrationNo", "RegistrationNoExists"]] : []),
  ];

  const results = [];
  const items = [];
  for (const x of read) {
    const v = x.values;
    const errors = [
      ...x.errors,
      ...x.dup.map((field) => ({ field, code: "ImportDupInFile" })),
    ];
    const ex =
      (v.code && existing.find((p) => String(p.code) === String(v.code))) ||
      (v.taxNo && existing.find((p) => p.taxNo === v.taxNo)) ||
      (v.phone && existing.find((p) => p.phone === v.phone)) ||
      (kind === "suppliers" &&
        v.registrationNo &&
        existing.find((p) => p.registrationNo === v.registrationNo)) ||
      (kind === "customers" &&
        v.idScheme &&
        v.idNumber &&
        existing.find(
          (p) => p.idScheme === v.idScheme && p.idNumber === v.idNumber,
        )) ||
      null;
    if (ex && !visible(ex)) {
      results.push({
        row: x.row,
        status: "error",
        errors: [{ field: "arName", code: "ImportNotInBranch" }],
      });
      continue;
    }
    if (ex && !options.updateExisting) {
      results.push({ row: x.row, status: "skip", errors: [] });
      continue;
    }

    const base = ex
      ? {
          ...Object.fromEntries(
            PARTY_KEYS.filter((k) => k in ex).map((k) => [k, ex[k]]),
          ),
          openingBalance: num(ex.openingBalance),
        }
      : { countryCode: "SA", isActive: true, openingBalance: 0 };
    const input = { ...base };
    for (const k of PARTY_KEYS) if (v[k] !== undefined) input[k] = v[k];
    if (!ex && !input.enName && input.arName) input.enName = input.arName;
    // النصوص الرقمية (الرقم الضريبي / العنوان) ممكن تيجي أرقام من Excel
    for (const k of PARTY_KEYS)
      if (typeof input[k] === "number" && !["openingBalance"].includes(k))
        input[k] = String(input[k]);
    if (kind === "suppliers") {
      delete input.countryCode;
      delete input.idScheme;
      delete input.idNumber;
    } else delete input.registrationNo;

    const schema = ex ? cfg.update : cfg.create;
    const parsed = schema.safeParse({ ...input, ...(ex ? { id: ex.id } : {}) });
    if (!parsed.success)
      errors.push(
        ...zodErrors(parsed.error.issues, (p) => String(p[0] ?? "arName")),
      );
    const data = parsed.success ? parsed.data : null;
    if (data) {
      if (data.phone && !rule.re.test(data.phone))
        errors.push({ field: "phone", code: rule.error });
      // العميل الشركة: بيانات الفاتورة الضريبية كاملة لو الفرع مربوط بالزكاة
      if (zatca) {
        const issues = customerB2BIssues(data);
        for (const [field, code] of Object.entries(issues))
          errors.push({ field, code });
      }
      // التكرار مع البرنامج
      for (const [field, code] of UNIQUE) {
        if (!data[field]) continue;
        const o = existing.find((p) => p[field] === data[field]);
        if (o && o.id !== ex?.id) errors.push({ field, code });
      }
      if (kind === "customers" && data.idScheme && data.idNumber) {
        const o = existing.find(
          (p) => p.idScheme === data.idScheme && p.idNumber === data.idNumber,
        );
        if (o && o.id !== ex?.id)
          errors.push({ field: "idNumber", code: "IdNumberExists" });
      }
    }
    if (errors.length) {
      results.push({ row: x.row, status: "error", errors });
      continue;
    }
    items.push({ row: x.row, ex, data });
    results.push({ row: x.row, status: ex ? "update" : "new", errors: [] });
  }
  return { results, items };
}

export async function checkParties(kind, rows, user, options) {
  const { results } = await prepareParties(kind, rows, user, options);
  return { results, creates: { categories: [], units: [] } };
}

export async function runParties(kind, rows, user, options) {
  const cfg = PARTY[kind];
  // الإتاحة في الفروع للجديد: زي الفورم (موظف الفرع ← فرعه)
  let branchIds = options.branchIds;
  if (branchIds?.length) {
    const found = await prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true },
    });
    branchIds = found.map((b) => b.id);
  }
  const scope = resolvePartyBranches(user, {
    allBranches: options.allBranches,
    branchIds,
  });

  const { results, items } = await prepareParties(kind, rows, user, options);
  const creates = items.filter((it) => !it.ex);
  const updates = items.filter((it) => it.ex);

  let added = 0;
  if (creates.length) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const m = tx[cfg.model];
          const { _max } = await m.aggregate({ _max: { code: true } });
          let code = (_max.code ?? 0) + 1;
          const list = creates.map((it) => {
            const data = omit(it.data, ["allBranches", "branchIds", "id"]);
            return { ...data, code: code++, allBranches: scope.allBranches };
          });
          await m.createMany({ data: list });
          if (!scope.allBranches && scope.branchIds.length) {
            const ids = await m.findMany({
              where: { code: { in: list.map((p) => p.code) } },
              select: { id: true },
            });
            await tx[cfg.branchModel].createMany({
              data: ids.flatMap((p) =>
                scope.branchIds.map((branchId) => ({
                  [cfg.fk]: p.id,
                  branchId,
                })),
              ),
            });
          }
          added = list.length;
        },
        { timeout: 120_000, maxWait: 15_000 },
      );
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      for (const it of creates) {
        const r = results.find((x) => x.row === it.row);
        r.status = "error";
        r.errors.push({ field: "arName", code: "DuplicateValue" });
      }
    }
  }

  // التحديث بخدمة التعديل نفسها (الإتاحة في الفروع متتغيرش)
  let updated = 0;
  for (const it of updates) {
    try {
      const data = omit(it.data, ["allBranches", "branchIds"]);
      await cfg.save({ ...data, id: it.ex.id }, user);
      updated++;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      const r = results.find((x) => x.row === it.row);
      r.status = "error";
      r.errors.push({
        field: Object.keys(error.fieldErrors ?? {})[0] ?? "arName",
        code: error.code,
      });
    }
  }
  return { results, added, updated };
}

// ============================================================
// الوحدات والأقسام (أعداد صغيرة): صف صف بخدمات الإضافة والتعديل نفسها
// - الموجود بيتعرف بالاسم العربي أو الإنجليزي
// - القسم الفرعي: القسم الرئيسي بالاسم (موجود في البرنامج، أو صف رئيسي في نفس الملف)
// ============================================================

const SIMPLE = {
  units: {
    model: "unit",
    create: createUnitSchema,
    update: updateUnitSchema,
    keys: ["arName", "enName", "allowDecimals", "isActive"],
    exists: "UnitNameExists",
  },
  categories: {
    model: "category",
    create: createCategorySchema,
    update: updateCategorySchema,
    keys: ["arName", "enName", "isActive"],
    exists: "CategoryNameExists",
  },
};

async function prepareSimple(kind, rows, options) {
  const cfg = SIMPLE[kind];
  const fields = IMPORT_FIELDS[kind];
  const isCat = kind === "categories";
  const existing = await prisma[cfg.model].findMany({
    select: {
      id: true,
      arName: true,
      enName: true,
      isActive: true,
      ...(isCat ? { parentId: true, _count: { select: { children: true } } } : { allowDecimals: true }),
    },
  });
  const byName = new Map();
  for (const x of existing) {
    byName.set(normName(x.enName), x);
    byName.set(normName(x.arName), x);
  }
  const read = rows.map((r) => ({ row: r.r, dup: r.d ?? [], ...readRow(fields, r.v) }));
  // الأقسام الرئيسية الجديدة في نفس الدفعة (عشان الفرعي اللي تحتها)
  const newMains = new Set(
    isCat
      ? read
          .filter((x) => x.values.arName && !x.values.parent)
          .flatMap((x) => [normName(x.values.arName), normName(x.values.enName)])
      : [],
  );

  const results = [];
  const items = [];
  for (const x of read) {
    const v = x.values;
    const errors = [
      ...x.errors,
      ...x.dup.map((field) => ({ field, code: "ImportDupInFile" })),
    ];
    const ex =
      (v.arName && byName.get(normName(v.arName))) ||
      (v.enName && byName.get(normName(v.enName))) ||
      null;
    if (ex && !options.updateExisting) {
      results.push({ row: x.row, status: "skip", errors: [] });
      continue;
    }
    const input = ex
      ? Object.fromEntries(cfg.keys.map((k) => [k, ex[k]]))
      : { isActive: true };
    for (const k of cfg.keys) if (v[k] !== undefined) input[k] = v[k];
    if (!ex && !input.enName && input.arName) input.enName = input.arName;

    // القسم الرئيسي: بالاسم (فاضي في التحديث = زي ما هو)
    let parentName = null;
    if (isCat) {
      if (v.parent) {
        const p = byName.get(normName(v.parent));
        if (p && p.parentId === null) input.parentId = p.id;
        else if (!p && newMains.has(normName(v.parent))) {
          input.parentId = PENDING_ID;
          parentName = v.parent;
        } else errors.push({ field: "parent", code: "ParentMustBeMainCategory" });
        if (ex && ex._count.children > 0)
          errors.push({ field: "parent", code: "CategoryHasChildren" });
      } else input.parentId = ex ? ex.parentId : null;
    }

    const schema = ex ? cfg.update : cfg.create;
    const parsed = schema.safeParse({
      ...input,
      ...(isCat ? { image: null } : {}),
      ...(ex ? { id: ex.id } : {}),
    });
    if (!parsed.success)
      errors.push(
        ...zodErrors(parsed.error.issues, (p) =>
          p[0] === "parentId" ? "parent" : String(p[0] ?? "arName"),
        ),
      );
    else {
      // الاسم مستخدم لوحدة/قسم تاني
      for (const field of ["arName", "enName"]) {
        const o = byName.get(normName(parsed.data[field]));
        if (o && o.id !== ex?.id) errors.push({ field, code: cfg.exists });
      }
    }
    if (errors.length) {
      results.push({ row: x.row, status: "error", errors });
      continue;
    }
    items.push({ row: x.row, ex, data: parsed.data, parentName });
    results.push({ row: x.row, status: ex ? "update" : "new", errors: [] });
  }
  return { results, items };
}

export async function checkSimple(kind, rows, user, options) {
  const { results } = await prepareSimple(kind, rows, options);
  return { results, creates: { categories: [], units: [] } };
}

export async function runSimple(kind, rows, user, options) {
  const { results, items } = await prepareSimple(kind, rows, options);
  const isCat = kind === "categories";
  // الرئيسي الأول، وبعده الفرعي (عشان يلاقي رقم الرئيسي الجديد)
  const ordered = [...items].sort(
    (a, b) => Number(Boolean(a.parentName)) - Number(Boolean(b.parentName)),
  );
  let added = 0;
  let updated = 0;
  for (const it of ordered) {
    try {
      let data = it.data;
      if (it.parentName) {
        const p = await prisma.category.findFirst({
          where: { OR: [{ arName: it.parentName }, { enName: it.parentName }] },
          select: { id: true },
        });
        if (!p) throw new AppError("ParentCategoryNotFound");
        data = { ...data, parentId: p.id };
      }
      if (it.ex) {
        await (isCat ? updateCategory(data) : updateUnit(data));
        updated++;
      } else {
        await (isCat ? createCategory(data) : createUnit(data));
        added++;
      }
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      const r = results.find((x) => x.row === it.row);
      r.status = "error";
      r.errors.push({ field: "arName", code: error.code });
    }
  }
  return { results, added, updated };
}
