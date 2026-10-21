// ============================================================
// تفصيل الكمية بوحدات الصنف (كرتونة / شدة / حبة ...)
// الكميات في المخزون محفوظة بالوحدة الأساسية (الأصغر)، وكل وحدة لها
// معامل تحويل = كم وحدة أساسية فيها (كرتونة = 24 حبة)
//
// مثال: 157 حبة، والكرتونة 24 والشدة 6
//   ← 6 كرتونة + 2 شدة + 1 حبة
//
// units: [{ unit: { id, arName, enName }, factor }] (الأساسية factor = 1)
// ============================================================

const round3 = (v) => Math.round((Number(v) + Number.EPSILON) * 1000) / 1000;

// الوحدات من الأكبر للأصغر (الأساسية في الآخر)
export const unitsBySize = (units = []) =>
  [...units]
    .filter((u) => Number(u.factor) > 0)
    .sort((a, b) => Number(b.factor) - Number(a.factor));

// الكمية بالوحدة الأساسية ← [{ unit, factor, qty }] لكل وحدة (بما فيها الأصفار)
// السالب يُفصَّل بنفس الطريقة وكل الأجزاء سالبة
export function breakdown(baseQty, units) {
  const list = unitsBySize(units);
  if (!list.length) return [];
  const sign = baseQty < 0 ? -1 : 1;
  let rest = Math.abs(Number(baseQty) || 0);
  return list.map((u, i) => {
    const f = Number(u.factor);
    const last = i === list.length - 1;
    // آخر وحدة تأخذ الباقي كله (حتى لو كسر: 0.5 كيلو مثلاً)
    const qty = last ? round3(rest / f) : Math.floor(round3(rest / f));
    rest = round3(rest - qty * f);
    return { unit: u.unit, factor: f, qty: qty * sign || 0 };
  });
}

// [{ factor, qty }] ← الإجمالي بالوحدة الأساسية
export const fromParts = (parts) =>
  round3(parts.reduce((s, p) => s + Number(p.qty || 0) * Number(p.factor), 0));

// نص التفصيل: "6 كرتونة · 2 شدة · 1 حبة" (بدون الأجزاء الصفرية)
export function breakdownText(baseQty, units, nameOf) {
  if (!units || units.length < 2) return "";
  const parts = breakdown(baseQty, units).filter((p) => p.qty !== 0);
  if (!parts.length) return "0";
  return parts.map((p) => `${round3(p.qty)} ${nameOf(p.unit)}`).join(" · ");
}
