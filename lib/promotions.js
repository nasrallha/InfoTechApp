import { calcInvoice, round } from "./invoice-calc";

// ============================================================
// تطبيق العروض على فاتورة (مشترك بين الشاشة والسيرفر)
// promos: العروض الشغالة النهارده على الفرع:
//   [{ id, arName, enName, scope: "invoice"|"category"|"product",
//      discountType: "percent"|"amount"|"fixedPrice", value, minInvoice,
//      productIds: [], categoryIds: [] (الأقسام الفرعية متضمنة) }]
// القواعد:
// - الصنف عليه أكتر من عرض ← الأفضل للعميل (أكبر خصم)
// - سطر عليه عرض: خصم العرض بيتحط مكان خصم السطر (لا يُجمع معه)
// - عرض إجمالي الفاتورة: يتطبق فوق خصومات الأصناف (لو الفاتورة وصلت للحد الأدنى)
//   ويحل محل خصم الفاتورة اليدوي
// - مبلغ العرض / السعر الثابت: للوحدة الأساسية (الكرتونة = السعر × عدد الحبات)
// ============================================================

const EPS = 0.0001;

// قيمة خصم عرض على سطر (بالمبلغ)
function lineDiscount(promo, line, factor, decimals) {
  const qty = Number(line.qty) || 0;
  const price = Number(line.price) || 0;
  const gross = round(qty * price, decimals);
  if (!(gross > 0)) return 0;
  const v = Number(promo.value) || 0;
  let amount = 0;
  if (promo.discountType === "percent") {
    amount = (gross * Math.min(v, 100)) / 100;
  } else if (promo.discountType === "amount") {
    amount = v * factor * qty;
  } else if (promo.discountType === "fixedPrice") {
    amount = Math.max(0, price - v * factor) * qty;
  }
  return Math.min(round(amount, decimals), gross);
}

const matches = (promo, line) =>
  promo.scope === "product"
    ? promo.productIds.includes(line.productId)
    : promo.scope === "category"
      ? line.categoryId != null && promo.categoryIds.includes(line.categoryId)
      : false;

// أفضل عرض لسطر: { promo, amount } أو null
export function bestLinePromo(promos, line, decimals = 2) {
  const factor =
    Number(line.factor) ||
    Number(line.units?.find((u) => u.unit.id === line.unitId)?.factor) ||
    1;
  let best = null;
  for (const p of promos) {
    if (p.scope === "invoice" || !matches(p, line)) continue;
    const amount = lineDiscount(p, line, factor, decimals);
    if (amount > EPS && (!best || amount > best.amount + EPS)) {
      best = { promo: p, amount };
    }
  }
  return best;
}

// يرجع السطور بعد العروض + خصم الفاتورة النهائي
// items: سطور الفاتورة (productId, categoryId, unitId, qty, price, factor أو units، discountType/Value)
// discountType/discountValue: خصم الفاتورة اليدوي
export function applyPromotions({
  items,
  promos = [],
  discountType = "amount",
  discountValue = 0,
  decimals = 2,
}) {
  const list = Array.isArray(promos) ? promos : [];
  const effective = items.map((it) => {
    const best = list.length ? bestLinePromo(list, it, decimals) : null;
    return best
      ? {
          ...it,
          discountType: "amount",
          discountValue: best.amount,
          promotionId: best.promo.id,
          promo: best.promo,
        }
      : { ...it, promotionId: null, promo: null };
  });

  // عرض إجمالي الفاتورة: الأفضل من العروض اللي الفاتورة وصلت لحدها الأدنى
  let invoicePromo = null;
  const invoicePromos = list.filter((p) => p.scope === "invoice");
  if (invoicePromos.length && effective.length) {
    const { lines, totals } = calcInvoice({
      items: effective,
      taxMode: "exclusive",
      discountType: "amount",
      discountValue: 0,
      decimals,
    });
    const base = lines.reduce((s, l) => s + l.afterItem, 0);
    let bestAmount = 0;
    for (const p of invoicePromos) {
      if (p.minInvoice != null && totals.total + EPS < Number(p.minInvoice)) {
        continue;
      }
      const v = Number(p.value) || 0;
      const amount =
        p.discountType === "percent"
          ? (base * Math.min(v, 100)) / 100
          : Math.min(v, base);
      if (amount > bestAmount + EPS) {
        bestAmount = amount;
        invoicePromo = p;
      }
    }
  }

  return {
    items: effective,
    discountType: invoicePromo
      ? invoicePromo.discountType === "percent"
        ? "percent"
        : "amount"
      : discountType,
    discountValue: invoicePromo ? Number(invoicePromo.value) : discountValue,
    invoicePromo,
    invoicePromotionId: invoicePromo?.id ?? null,
  };
}
