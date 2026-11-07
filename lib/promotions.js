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

// عرض الولاء: السطر داخل فيه؟ (كل الخدمات / أقسام / أصناف)
export const loyaltyMatches = (promo, line) =>
  promo.loyaltyTarget === "service"
    ? Boolean(line.isService)
    : promo.loyaltyTarget === "category"
      ? line.categoryId != null && promo.categoryIds.includes(line.categoryId)
      : promo.productIds.includes(line.productId);

// أفضل عرض لسطر: { promo, amount } أو null
export function bestLinePromo(promos, line, decimals = 2) {
  const factor =
    Number(line.factor) ||
    Number(line.units?.find((u) => u.unit.id === line.unitId)?.factor) ||
    1;
  let best = null;
  for (const p of promos) {
    if (p.scope === "invoice" || p.scope === "loyalty" || !matches(p, line))
      continue;
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
// loyalty: حالة عروض الولاء للعميل { [promoId]: { paid, rewards } }
//   paid = المرات المدفوعة قبل الفاتورة دي، rewards = المرات المجانية اللي خدها
//   (من غير عميل مسجّل: عروض الولاء مش بتتطبق)
export function applyPromotions({
  items,
  promos = [],
  discountType = "amount",
  discountValue = 0,
  decimals = 2,
  loyalty = null,
}) {
  const list = Array.isArray(promos) ? promos : [];
  let effective = items.map((it) => {
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

  // ---------- عروض الولاء: كل N مرة مدفوعة ← المرة اللي بعدها بخصم ----------
  const loyaltyInfo = [];
  for (const p of list) {
    if (p.scope !== "loyalty" || !loyalty) continue;
    const every = Number(p.loyaltyEvery) || 0;
    const st = loyalty[p.id];
    if (every < 1 || !st) continue;
    const idx = effective
      .map((l, i) => (l.loyaltyQty == null && loyaltyMatches(p, l) ? i : -1))
      .filter((i) => i >= 0);
    const cartQty = idx.reduce(
      (s, i) => s + Math.floor(Number(effective[i].qty) || 0),
      0,
    );
    // أكبر عدد مجاني: المدفوع (قبل + في الفاتورة من غير المجاني) ÷ N ناقص اللي خده
    let free = 0;
    while (
      free < cartQty &&
      Math.floor((st.paid + cartQty - (free + 1)) / every) - st.rewards >=
        free + 1
    )
      free++;
    // المجاني على الأرخص الأول
    let left = free;
    const order = [...idx].sort(
      (a, b) => Number(effective[a].price) - Number(effective[b].price),
    );
    const pct = Math.min(Number(p.value) || 100, 100);
    for (const i of order) {
      if (!left) break;
      const l = effective[i];
      const units = Math.min(left, Math.floor(Number(l.qty) || 0));
      if (!units) continue;
      left -= units;
      const amount = Math.min(
        round((units * Number(l.price) * pct) / 100, decimals),
        round(Number(l.qty) * Number(l.price), decimals),
      );
      effective[i] = {
        ...l,
        discountType: "amount",
        discountValue: amount,
        promotionId: p.id,
        promo: p,
        loyaltyQty: units,
      };
    }
    const paidTotal = st.paid + cartQty - free;
    loyaltyInfo.push({
      promo: p,
      every,
      free,
      // فاضل كام مرة مدفوعة على المجانية الجاية
      left: Math.max(0, every * (st.rewards + free + 1) - paidTotal),
    });
  }
  effective = effective.map((l) =>
    l.loyaltyQty == null ? { ...l, loyaltyQty: null } : l,
  );

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
    loyaltyInfo,
  };
}
