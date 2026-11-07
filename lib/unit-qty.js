// ============================================================
// الكميات والوحدات (السيرفر والمتصفح)
// - الوحدة تقبل كسور ولا لأ (شاشة الوحدات ← تقبل كسور)
// - عرض الكمية: صحيحة من غير أصفار (18)، وبكسر بـ 3 خانات (0.250)
// ============================================================

const EPS = 1e-6;

export const isWholeQty = (v) => Math.abs(v - Math.round(v)) < EPS;

// المشكلة في الكمية (أو null)
// qty: بالوحدة اللي بيبيع بيها، factor: كام وحدة أساسية فيها
// "unit": الوحدة نفسها متقبلش كسور والكمية فيها كسر (1.5 شدة)
// "base": الأساسية متقبلش كسور والكمية بعد التحويل فيها كسر (1.3 كرتونة = 15.6 حبة)
export function qtyProblem({
  qty,
  factor = 1,
  unitAllows = true,
  baseAllows = true,
}) {
  const q = Number(qty);
  if (!Number.isFinite(q)) return null;
  if (!unitAllows && !isWholeQty(q)) return "unit";
  if (!baseAllows && !isWholeQty(q * Number(factor || 1))) return "base";
  return null;
}

// نص الكمية للعرض والطباعة: 18 | 0.250 | 1.500
export function qtyText(v) {
  const q = Math.round(Number(v ?? 0) * 1000) / 1000;
  return isWholeQty(q) ? String(Math.round(q)) : q.toFixed(3);
}

// سطر فاتورة في الواجهة (الكاشير / فاتورة البيع):
// { qty, unitId, units: [{ unit: { id, allowDecimals }, factor }] } ← الأساسية أول واحدة
export function lineQtyProblem(l) {
  const units = l?.units ?? [];
  if (!units.length) return null;
  const unit = units.find((u) => u.unit?.id === l.unitId) ?? units[0];
  return qtyProblem({
    qty: l.qty,
    factor: unit.factor ?? 1,
    unitAllows: unit.unit?.allowDecimals !== false,
    baseAllows: units[0].unit?.allowDecimals !== false,
  });
}

export const qtyProblemKey = (p) =>
  p === "base" ? "QtyBaseNoDecimals" : "QtyNoDecimals";

// ============================================================
// وحدة التعبئة (السيراميك والرخام: الكرتونة = 1.44 م²، الأقمشة: الطاقة = 50 متر)
// الأساسية بتقبل كسور + وحدة إضافية أكبر من 1 (أصغرها لو كذا وحدة)
// units: [{ unit: { id, allowDecimals }, factor }] ← الأساسية أول واحدة
// ============================================================
export function packOf(units) {
  if (!units?.length || units[0].unit?.allowDecimals === false) return null;
  const packs = units.slice(1).filter((u) => Number(u.factor) > 1);
  if (!packs.length) return null;
  return packs.reduce((a, b) => (Number(a.factor) <= Number(b.factor) ? a : b));
}

// تحويل سطر الفاتورة للوحدة التانية (أو null)
// - بالأساسية (10 م²) ← { kind: "pack", qty: 6.944, unit: كرتونة, round: { packs: 7, qty: 10.08 } }
// - بالتعبئة (7 كراتين) ← { kind: "base", qty: 10.08, unit: م² }
export function lineConversion(l) {
  const pack = packOf(l?.units);
  if (!pack) return null;
  const cur = l.units.find((u) => u.unit?.id === l.unitId) ?? l.units[0];
  const factor = Number(cur.factor ?? 1);
  const baseQty = Number(l.qty) * factor;
  if (!(baseQty > 0)) return null;
  // بالكرتونة أو بالبلاطة ← كام م²
  if (factor !== 1)
    return { kind: "base", qty: round3(baseQty), unit: l.units[0].unit };
  const packs = baseQty / Number(pack.factor);
  const whole = Math.ceil(packs - 1e-6);
  return {
    kind: "pack",
    qty: round3(packs),
    unit: pack.unit,
    base: l.units[0].unit,
    round: isWholeQty(packs)
      ? null
      : { packs: whole, qty: round3(whole * Number(pack.factor)) },
  };
}

const round3 = (v) => Math.round(Number(v) * 1000) / 1000;

// الطباعة: السطر المحفوظ (baseQty + factor) + تعبئة الصنف
// item.pack: { baseUnit: { allowDecimals }, productUnits: [{ conversionFactor, unit }] }
// يرجّع { qty, unit } للوحدة التانية (أو null)
export function savedLineConversion(item) {
  const p = item?.pack;
  const pack = p?.productUnits?.[0];
  if (!pack || p.baseUnit?.allowDecimals === false) return null;
  const pf = Number(pack.conversionFactor);
  if (!(pf > 1)) return null;
  const factor = Number(item.factor ?? 1);
  const baseQty = Number(item.baseQty ?? Number(item.qty) * factor);
  if (!(baseQty > 0)) return null;
  if (factor !== 1) return { qty: round3(baseQty), unit: p.baseUnit };
  return { qty: round3(baseQty / pf), unit: pack.unit };
}
