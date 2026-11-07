import "server-only";
import { AppError } from "@/lib/errors";
import { hasModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { dayToDbDate } from "@/lib/dates";
import { warrantyEndDay } from "@/lib/warranty";

// ============================================================
// الأرقام التسلسلية في البيع والمرتجع (وحدة serials)
// - البيع: القطعة بتتسجل (أو بتتحدث لو اتسجلت في الشراء/رجعت بمرتجع) وتبقى "مباعة"
// - الرقم المباع مايتباعش تاني إلا بعد مرتجعه
// - المرتجع: القطعة ترجع "في المحل"، وحذف المرتجع يرجّعها مباعة
// - كل حركة بتتسجل في sale_item_serials (تاريخ القطعة)
// ============================================================

export const SOLD = "sold";
export const IN_STOCK = "in_stock";
const EPS = 0.0001;

// هل الشركة مفعّل عندها الأرقام التسلسلية؟ + إلزامها عند البيع
export async function serialContext() {
  if (!(await hasModule("serials"))) return { on: false, required: false };
  const s = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { serialRequired: true },
  });
  return { on: true, required: s?.serialRequired ?? true };
}

const clean = (v) => (typeof v === "string" ? v.trim() : "");

// نهاية الضمان كتاريخ (عمود DATE)
export function warrantyEnd(date, months) {
  const day = warrantyEndDay(date, months);
  return day ? dayToDbDate(day) : null;
}

// ------------------------------------------------------------
// قبل الحفظ: أرقام كل سطر + الضمان (بيرجع مصفوفة بنفس ترتيب السطور)
// items: سطور الفاتورة بعد التحقق (فيها product و factor و qty)
// ------------------------------------------------------------
export function prepareSaleSerials(items, ctx) {
  const seen = new Set();
  return items.map((it, i) => {
    const p = it.product;
    // الضمان: للأصناف اللي ليها ضمان أو متتبعة (الوحدة مفعّلة بس)
    const warrantyMonths = !ctx.on
      ? null
      : Number.isInteger(it.warrantyMonths) && it.warrantyMonths >= 0
        ? it.warrantyMonths
        : (p.warrantyMonths ?? 0);
    const warranty = {
      warrantyMonths:
        ctx.on && (p.serialCount > 0 || warrantyMonths > 0)
          ? warrantyMonths
          : null,
      warrantyType:
        ctx.on && warrantyMonths > 0 ? (p.warrantyType ?? "store") : null,
    };
    const tracked = ctx.on && p.serialCount > 0;
    if (!tracked) return { ...warranty, serials: [] };

    const field = { [`items.${i}.qty`]: "SerialsMissing" };
    const baseQty = Number(it.qty) * Number(it.factor);
    if (Math.abs(baseQty - Math.round(baseQty)) > EPS) {
      throw new AppError("SerialQtyInteger", { code: p.code }, field);
    }
    const need = Math.round(baseQty);
    const serials = (it.serials ?? [])
      .map((s) => ({
        serial: clean(s.serial),
        serial2: p.serialCount === 2 ? clean(s.serial2) || null : null,
        isUsed: Boolean(s.isUsed),
      }))
      .filter((s) => s.serial);

    if (serials.length > need) {
      throw new AppError(
        "SerialsExceedQty",
        { code: p.code, need, got: serials.length },
        field,
      );
    }
    if (ctx.required && serials.length < need) {
      throw new AppError(
        "SerialsMissing",
        { code: p.code, need, got: serials.length },
        field,
      );
    }
    for (const s of serials) {
      if (ctx.required && p.serialCount === 2 && !s.serial2) {
        throw new AppError("Serial2Missing", { code: p.code }, field);
      }
      for (const v of [s.serial, s.serial2].filter(Boolean)) {
        const key = `${p.id}:${v.toLowerCase()}`;
        if (seen.has(key)) throw new AppError("SerialDuplicate", { serial: v });
        seen.add(key);
      }
    }
    return { ...warranty, serials };
  });
}

// ------------------------------------------------------------
// بعد إنشاء سطور البيع: تسجيل القطع كمباعة + ربطها بالسطور
// itemIds: أرقام السطور بنفس ترتيب lines
// lines: [{ productId, serials, warrantyMonths, warrantyType }]
// ------------------------------------------------------------
export async function attachSaleSerials(
  tx,
  itemIds,
  lines,
  { customerId, date },
) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.serials?.length) continue;
    const saleItemId = itemIds[i];
    const endsAt = warrantyEnd(date, line.warrantyMonths ?? 0);
    for (const s of line.serials) {
      const sold = {
        status: SOLD,
        saleItemId,
        customerId: customerId ?? null,
        soldAt: date,
        warrantyMonths: line.warrantyMonths ?? null,
        warrantyType: line.warrantyType ?? null,
        warrantyEndsAt: endsAt,
        isUsed: s.isUsed,
      };
      // الرقم التاني مايبقاش رقم قطعة تانية مباعة لنفس الصنف
      if (s.serial2) {
        const clash = await tx.productSerial.findFirst({
          where: {
            productId: line.productId,
            status: SOLD,
            serial: { not: s.serial },
            OR: [{ serial: s.serial2 }, { serial2: s.serial2 }],
          },
          select: { id: true },
        });
        if (clash)
          throw new AppError("SerialAlreadySold", { serial: s.serial2 });
      }
      const existing = await tx.productSerial.findUnique({
        where: {
          productId_serial: { productId: line.productId, serial: s.serial },
        },
        select: { id: true, serial2: true },
      });
      let serialId;
      if (existing) {
        // متاحة بس لو في المحل (القفل على الصف يمنع بيعها مرتين في نفس اللحظة)
        // والتالفة متتباعش
        const { count } = await tx.productSerial.updateMany({
          where: { id: existing.id, status: { notIn: [SOLD, "damaged"] } },
          data: { ...sold, serial2: s.serial2 ?? existing.serial2 },
        });
        if (!count) {
          const cur = await tx.productSerial.findUnique({
            where: { id: existing.id },
            select: { status: true },
          });
          throw new AppError(
            cur?.status === "damaged" ? "SerialDamaged" : "SerialAlreadySold",
            { serial: s.serial },
          );
        }
        serialId = existing.id;
      } else {
        try {
          const created = await tx.productSerial.create({
            data: {
              ...sold,
              productId: line.productId,
              serial: s.serial,
              serial2: s.serial2,
            },
            select: { id: true },
          });
          serialId = created.id;
        } catch (e) {
          // اتسجلت في نفس اللحظة من فاتورة تانية
          if (e?.code === "P2002")
            throw new AppError("SerialAlreadySold", { serial: s.serial });
          throw e;
        }
      }
      await tx.saleItemSerial.create({
        data: {
          saleItemId,
          serialId,
          serialText: s.serial,
          serial2Text: s.serial2 ?? null,
        },
      });
    }
  }
}

// ------------------------------------------------------------
// قبل تعديل/حذف فاتورة بيع: القطع اللي اتباعت بيها ترجع زي ما كانت
// - قطعة ليها تاريخ تاني (شراء أو بيع قبل كده) ← ترجع "في المحل"
// - قطعة اتسجلت بالفاتورة دي بس ← تتمسح
// (روابط السطور بتتمسح لوحدها مع السطور)
// ------------------------------------------------------------
export async function releaseSaleSerials(tx, saleId) {
  const items = await tx.saleItem.findMany({
    where: { saleId },
    select: { id: true },
  });
  const itemIds = items.map((i) => i.id);
  if (!itemIds.length) return;
  const serials = await tx.productSerial.findMany({
    where: { saleItemId: { in: itemIds }, status: SOLD },
    select: {
      id: true,
      purchaseItemId: true,
      surplusItemId: true,
      _count: {
        select: { links: { where: { saleItemId: { notIn: itemIds } } } },
      },
    },
  });
  // اللي دخلت بشراء أو بزيادة أو ليها بيع تاني ← ترجع للمحل، وغيرها يتمسح
  const drop = serials
    .filter(
      (s) => !s.purchaseItemId && !s.surplusItemId && s._count.links === 0,
    )
    .map((s) => s.id);
  const keep = serials.filter((s) => !drop.includes(s.id)).map((s) => s.id);
  if (drop.length)
    await tx.productSerial.deleteMany({ where: { id: { in: drop } } });
  if (keep.length)
    await tx.productSerial.updateMany({
      where: { id: { in: keep } },
      data: inStockData,
    });
}

const inStockData = {
  status: IN_STOCK,
  saleItemId: null,
  customerId: null,
  soldAt: null,
  warrantyMonths: null,
  warrantyType: null,
  warrantyEndsAt: null,
};

// ------------------------------------------------------------
// المرتجع: القطع المختارة لازم تكون مباعة بالسطر الأصلي
// lines: [{ o (السطر الأصلي), baseQty, serialIds }]
// بيرجع نفس الترتيب: [{ serials: [{id, serial, serial2}] }]
// ------------------------------------------------------------
export async function prepareReturnSerials(tx, lines) {
  const out = [];
  for (const l of lines) {
    const linked = await tx.productSerial.findMany({
      where: { saleItemId: l.o.id, status: SOLD },
      select: { id: true, serial: true, serial2: true },
    });
    const ids = [...new Set(l.serialIds ?? [])];
    if (!linked.length) {
      if (ids.length) throw new AppError("SerialNotInSale");
      out.push({ serials: [] });
      continue;
    }
    const byId = new Map(linked.map((s) => [s.id, s]));
    if (ids.some((id) => !byId.has(id))) throw new AppError("SerialNotInSale");
    // القطع اللي اتباعت من غير رقم (الإدخال اختياري) ممكن ترجع من غير رقم
    const baseQty = Math.round(l.baseQty);
    const remainingBase = Math.round(
      Number(l.o.baseQty) - Number(l.returnedBaseBefore ?? 0),
    );
    const unnumbered = Math.max(0, remainingBase - linked.length);
    const need = Math.max(0, baseQty - unnumbered);
    if (ids.length < need || ids.length > baseQty) {
      throw new AppError("SerialReturnCount", {
        code: l.o.code,
        need,
        max: baseQty,
      });
    }
    out.push({ serials: ids.map((id) => byId.get(id)) });
  }
  return out;
}

// بعد إنشاء سطور المرتجع: القطع ترجع "في المحل" + ربطها بسطور المرتجع
export async function attachReturnSerials(tx, itemIds, prepared) {
  for (let i = 0; i < prepared.length; i++) {
    for (const s of prepared[i].serials) {
      const { count } = await tx.productSerial.updateMany({
        where: { id: s.id, status: SOLD },
        data: inStockData,
      });
      if (!count) throw new AppError("SerialNotInSale");
      await tx.saleItemSerial.create({
        data: {
          saleItemId: itemIds[i],
          serialId: s.id,
          serialText: s.serial,
          serial2Text: s.serial2 ?? null,
        },
      });
    }
  }
}

// قبل حذف مرتجع: القطع ترجع مباعة بالسطر الأصلي (لو متباعتش تاني)
export async function restoreReturnSerials(tx, returnId) {
  const items = await tx.saleItem.findMany({
    where: { saleId: returnId },
    select: {
      returnOfItemId: true,
      serials: { select: { serialId: true, serialText: true } },
      returnOfItem: {
        select: {
          id: true,
          warrantyMonths: true,
          warrantyType: true,
          sale: { select: { customerId: true, date: true } },
        },
      },
    },
  });
  for (const it of items) {
    const o = it.returnOfItem;
    if (!o) continue;
    for (const link of it.serials) {
      const { count } = await tx.productSerial.updateMany({
        where: { id: link.serialId, status: IN_STOCK },
        data: {
          status: SOLD,
          saleItemId: o.id,
          customerId: o.sale.customerId ?? null,
          soldAt: o.sale.date,
          warrantyMonths: o.warrantyMonths ?? null,
          warrantyType: o.warrantyType ?? null,
          warrantyEndsAt: warrantyEnd(o.sale.date, o.warrantyMonths ?? 0),
        },
      });
      if (!count)
        throw new AppError("SerialResold", { serial: link.serialText });
    }
  }
}

// القطع المباعة حاليًا بكل سطر (لشاشة المرتجع)
export async function soldSerialsByItem(itemIds) {
  if (!itemIds.length) return new Map();
  const rows = await prisma.productSerial.findMany({
    where: { saleItemId: { in: itemIds }, status: SOLD },
    orderBy: { id: "asc" },
    select: { id: true, saleItemId: true, serial: true, serial2: true },
  });
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.saleItemId)) map.set(r.saleItemId, []);
    map.get(r.saleItemId).push({
      id: r.id,
      serial: r.serial,
      serial2: r.serial2,
    });
  }
  return map;
}

// ============================================================
// الشراء (إدخال الأرقام اختياري)
// - القطعة بتتسجل "في المحل" ومربوطة بسطر الشراء
// - رقم موجود في المحل بالفعل ← مرفوض
// - رقم مباع لعميل ← مرفوض (يرجع بمرتجع مبيعات)
// - رقم رجع للمورد قبل كده ← بيرجع "في المحل"
// ============================================================
export const RETURNED = "returned";

// قبل الحفظ: أرقام كل سطر (عدد القطع أو أقل)
// items: سطور الفاتورة بعد التحقق (product فيه serialCount، و factor و qty)
export function preparePurchaseSerials(items, ctx) {
  const seen = new Set();
  return items.map((it, i) => {
    const p = it.product;
    if (!ctx.on || !(p.serialCount > 0)) return { serials: [] };
    const serials = (it.serials ?? [])
      .map((s) => ({
        serial: clean(s.serial),
        serial2: p.serialCount === 2 ? clean(s.serial2) || null : null,
        isUsed: Boolean(s.isUsed),
      }))
      .filter((s) => s.serial);
    if (!serials.length) return { serials };
    const field = { [`items.${i}.qty`]: "SerialsExceedQty" };
    const baseQty = Number(it.qty) * Number(it.factor);
    if (Math.abs(baseQty - Math.round(baseQty)) > EPS)
      throw new AppError("SerialQtyInteger", { code: p.code }, field);
    if (serials.length > Math.round(baseQty))
      throw new AppError(
        "SerialsExceedQty",
        { code: p.code, need: Math.round(baseQty), got: serials.length },
        field,
      );
    for (const s of serials) {
      for (const v of [s.serial, s.serial2].filter(Boolean)) {
        const key = `${p.id}:${v.toLowerCase()}`;
        if (seen.has(key)) throw new AppError("SerialDuplicate", { serial: v });
        seen.add(key);
      }
    }
    return { serials };
  });
}

// أرقام فاتورة الشراء الحالية (قبل التعديل/الحذف: السطور هتتمسح)
export async function purchaseSerialIds(tx, purchaseId) {
  const rows = await tx.productSerial.findMany({
    where: { purchaseItem: { purchaseId } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

// بعد إنشاء سطور الشراء: تسجيل القطع "في المحل"
// own: أرقام كانت على نفس الفاتورة قبل التعديل (بتتربط بالسطر الجديد زي ما هي)
export async function attachPurchaseSerials(
  tx,
  itemIds,
  lines,
  own = new Set(),
) {
  const kept = new Set();
  for (let i = 0; i < lines.length; i++) {
    for (const s of lines[i].serials ?? []) {
      const productId = lines[i].productId;
      const existing = await tx.productSerial.findUnique({
        where: { productId_serial: { productId, serial: s.serial } },
        select: { id: true, status: true },
      });
      if (existing && own.has(existing.id)) {
        await tx.productSerial.update({
          where: { id: existing.id },
          data: {
            purchaseItemId: itemIds[i],
            serial2: s.serial2,
            isUsed: s.isUsed,
          },
        });
        kept.add(existing.id);
      } else if (existing) {
        if (existing.status === IN_STOCK)
          throw new AppError("SerialInStock", { serial: s.serial });
        // مباع لعميل: يرجع للمحل بمرتجع مبيعات، مش بفاتورة شراء
        if (existing.status === SOLD)
          throw new AppError("SerialSoldToCustomer", { serial: s.serial });
        await tx.productSerial.update({
          where: { id: existing.id },
          data: {
            ...inStockData,
            purchaseItemId: itemIds[i],
            purchaseReturnItemId: null,
            serial2: s.serial2,
            isUsed: s.isUsed,
          },
        });
      } else {
        try {
          await tx.productSerial.create({
            data: {
              productId,
              serial: s.serial,
              serial2: s.serial2,
              isUsed: s.isUsed,
              status: IN_STOCK,
              purchaseItemId: itemIds[i],
            },
          });
        } catch (e) {
          if (e?.code === "P2002")
            throw new AppError("SerialInStock", { serial: s.serial });
          throw e;
        }
      }
    }
  }
  return kept;
}

// أرقام قديمة اتشالت من الفاتورة (أو الفاتورة اتمسحت):
// اللي لسه في المحل ومالهاش أي حركة بيع ← تتمسح، والباقي بيفضل (تاريخه محفوظ)
export async function dropUnusedPurchaseSerials(tx, ids, kept = new Set()) {
  const drop = [...ids].filter((id) => !kept.has(id));
  if (!drop.length) return;
  await tx.productSerial.deleteMany({
    where: {
      id: { in: drop },
      status: IN_STOCK,
      links: { none: {} },
    },
  });
}

// ------------------------------------------------------------
// مرتجع المشتريات: القطع المختارة (اختياري) لازم تكون في المحل ومن نفس السطر
// lines: [{ o (سطر الشراء), baseQty, serialIds }] ← [{ ids }]
// ------------------------------------------------------------
export async function preparePurchaseReturnSerials(tx, lines) {
  const out = [];
  for (const l of lines) {
    const ids = [...new Set(l.serialIds ?? [])];
    if (!ids.length) {
      out.push({ ids: [] });
      continue;
    }
    if (ids.length > Math.round(l.baseQty))
      throw new AppError("SerialReturnCount", {
        code: l.o.code,
        need: 0,
        max: Math.round(l.baseQty),
      });
    const found = await tx.productSerial.count({
      where: { id: { in: ids }, purchaseItemId: l.o.id, status: IN_STOCK },
    });
    if (found !== ids.length) throw new AppError("SerialNotInPurchase");
    out.push({ ids });
  }
  return out;
}

export async function attachPurchaseReturnSerials(tx, itemIds, prepared) {
  for (let i = 0; i < prepared.length; i++) {
    if (!prepared[i].ids.length) continue;
    const { count } = await tx.productSerial.updateMany({
      where: { id: { in: prepared[i].ids }, status: IN_STOCK },
      data: { status: RETURNED, purchaseReturnItemId: itemIds[i] },
    });
    if (count !== prepared[i].ids.length)
      throw new AppError("SerialNotInPurchase");
  }
}

// قبل حذف مرتجع مشتريات: القطع ترجع "في المحل" (لو متباعتش)
export async function restorePurchaseReturnSerials(tx, returnId) {
  await tx.productSerial.updateMany({
    where: {
      purchaseReturnItem: { purchaseId: returnId },
      status: RETURNED,
    },
    data: { status: IN_STOCK, purchaseReturnItemId: null },
  });
}

// القطع اللي لسه في المحل بكل سطر شراء (لشاشة مرتجع المشتريات)
export async function stockSerialsByPurchaseItem(itemIds) {
  if (!itemIds.length) return new Map();
  const rows = await prisma.productSerial.findMany({
    where: { purchaseItemId: { in: itemIds }, status: IN_STOCK },
    orderBy: { id: "asc" },
    select: { id: true, purchaseItemId: true, serial: true, serial2: true },
  });
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.purchaseItemId)) map.set(r.purchaseItemId, []);
    map.get(r.purchaseItemId).push({
      id: r.id,
      serial: r.serial,
      serial2: r.serial2,
    });
  }
  return map;
}

// ============================================================
// التوالف والزيادات
// - التالف: القطع المختارة (من اللي في المحل) حالتها تبقى "تالف"
//   ولو الصنف عليه أرقام مسجلة في المحل كفاية للكمية ← لازم تتختار كلها
//   (لو مفيش أرقام كفاية - الشراء بيسجّلها اختياري - بيكمل بالكمية بس)
// - الزيادة: أرقام اختيارية (زي الشراء) ← تدخل "في المحل"
// - الإلغاء/التعديل بيرجّع كل ده زي ما كان
// ============================================================
export const DAMAGED = "damaged";

// قبل حفظ التالف (جوه الـ transaction): التحقق من القطع المختارة لكل سطر
// lines: [{ product (id, code, serialCount), qty, factor, serialIds }]
export async function prepareDamageSerials(tx, lines, ctx) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const p = l.product;
    if (!ctx.on || !(p.serialCount > 0)) {
      out.push({ ids: [] });
      continue;
    }
    const ids = [...new Set(l.serialIds ?? [])];
    const field = { [`items.${i}.serials`]: "DamageSerialsCount" };
    const baseQty = Number(l.qty) * Number(l.factor);
    const inStock = await tx.productSerial.count({
      where: { productId: p.id, status: IN_STOCK },
    });
    if (
      (ids.length || inStock) &&
      Math.abs(baseQty - Math.round(baseQty)) > EPS
    )
      throw new AppError("SerialQtyInteger", { code: p.code }, field);
    const need = Math.min(Math.round(baseQty), inStock);
    if (ids.length !== need)
      throw new AppError(
        "DamageSerialsCount",
        { code: p.code, need, got: ids.length },
        field,
      );
    for (const id of ids) {
      if (seen.has(id)) throw new AppError("SerialDuplicate", { serial: id });
      seen.add(id);
    }
    if (ids.length) {
      const found = await tx.productSerial.count({
        where: { id: { in: ids }, productId: p.id, status: IN_STOCK },
      });
      if (found !== ids.length)
        throw new AppError("SerialNotInStock", { code: p.code }, field);
    }
    out.push({ ids });
  }
  return out;
}

// بعد إنشاء سطور التالف: القطع تبقى "تالف" ومربوطة بالسطر
export async function attachDamageSerials(tx, itemIds, prepared) {
  for (let i = 0; i < prepared.length; i++) {
    if (!prepared[i].ids.length) continue;
    const { count } = await tx.productSerial.updateMany({
      where: { id: { in: prepared[i].ids }, status: IN_STOCK },
      data: { status: DAMAGED, damageItemId: itemIds[i] },
    });
    if (count !== prepared[i].ids.length)
      throw new AppError("SerialNotInStock", {});
  }
}

// إلغاء/تعديل التالف: القطع ترجع "في المحل"
export async function restoreDamageSerials(tx, adjustmentId) {
  await tx.productSerial.updateMany({
    where: { damageItem: { adjustmentId }, status: DAMAGED },
    data: { status: IN_STOCK, damageItemId: null },
  });
}

// بعد إنشاء سطور الزيادة: تسجيل القطع "في المحل"
// lines: [{ productId, serials }] (من preparePurchaseSerials)
export async function attachSurplusSerials(tx, itemIds, lines) {
  for (let i = 0; i < lines.length; i++) {
    for (const s of lines[i].serials ?? []) {
      const productId = lines[i].productId;
      const existing = await tx.productSerial.findUnique({
        where: { productId_serial: { productId, serial: s.serial } },
        select: { id: true, status: true },
      });
      if (existing) {
        if (existing.status === IN_STOCK)
          throw new AppError("SerialInStock", { serial: s.serial });
        if (existing.status === SOLD)
          throw new AppError("SerialSoldToCustomer", { serial: s.serial });
        // تالف قبل كده / راجع للمورد ← يرجع للمحل (تاريخه بيفضل)
        await tx.productSerial.update({
          where: { id: existing.id },
          data: {
            ...inStockData,
            surplusItemId: itemIds[i],
            serial2: s.serial2,
            isUsed: s.isUsed,
          },
        });
      } else {
        try {
          await tx.productSerial.create({
            data: {
              productId,
              serial: s.serial,
              serial2: s.serial2,
              isUsed: s.isUsed,
              status: IN_STOCK,
              surplusItemId: itemIds[i],
            },
          });
        } catch (e) {
          if (e?.code === "P2002")
            throw new AppError("SerialInStock", { serial: s.serial });
          throw e;
        }
      }
    }
  }
}

// إلغاء/تعديل الزيادة: القطع اللي دخلت بيها تخرج
// - لو اتباعت ← مرفوض (لازم مرتجع البيع الأول)
// - اتسجلت بالزيادة دي بس ← تتمسح، وغير كده ترجع لحالتها اللي قبلها
export async function revertSurplusSerials(tx, adjustmentId) {
  const rows = await tx.productSerial.findMany({
    where: { surplusItem: { adjustmentId } },
    select: {
      id: true,
      serial: true,
      status: true,
      purchaseItemId: true,
      purchaseReturnItemId: true,
      damageItemId: true,
      _count: { select: { links: true } },
    },
  });
  for (const r of rows) {
    if (r.status !== IN_STOCK)
      throw new AppError("SurplusSerialUsed", { serial: r.serial });
    if (r._count.links) {
      // اتباعت قبل كده ورجعت بمرتجع: بتفضل بتاريخها، بس مش من الزيادة
      await tx.productSerial.update({
        where: { id: r.id },
        data: { surplusItemId: null },
      });
    } else if (r.damageItemId) {
      await tx.productSerial.update({
        where: { id: r.id },
        data: { status: DAMAGED, surplusItemId: null },
      });
    } else if (r.purchaseReturnItemId) {
      await tx.productSerial.update({
        where: { id: r.id },
        data: { status: RETURNED, surplusItemId: null },
      });
    } else if (r.purchaseItemId) {
      await tx.productSerial.update({
        where: { id: r.id },
        data: { surplusItemId: null },
      });
    } else {
      await tx.productSerial.delete({ where: { id: r.id } });
    }
  }
}

// القطع اللي في المحل لصنف (لاختيار التالف)
export async function inStockSerials(productId) {
  return prisma.productSerial.findMany({
    where: { productId, status: IN_STOCK },
    orderBy: { id: "asc" },
    take: 1000,
    select: { id: true, serial: true, serial2: true },
  });
}
