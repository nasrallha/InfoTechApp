// ============================================================
// حساب الفواتير (مشترك بين الشاشة والسيرفر)
// - الشاشة تستخدمه لتحديث الأرقام أول بأول
// - السيرفر يعيد الحساب بنفسه ولا يثق في أرقام المتصفح
//
// أوضاع الضريبة (taxMode):
//   exclusive = السعر غير شامل: الضريبة تُضاف فوق الصافي
//   inclusive = السعر شامل: الضريبة تُستخرج من الإجمالي
//   none      = بدون ضريبة: النسبة صفر لكل الأصناف
//
// الخصم دائماً قبل الضريبة:
//   1) خصم الصنف (نسبة أو مبلغ) من (الكمية × السعر)
//   2) خصم الفاتورة (نسبة أو مبلغ) يتوزع على الأصناف حسب قيمة كل صنف
//      (حتى تكون ضريبة كل صنف صحيحة، ويُرجَّع الصنف بالمبلغ الذي دُفع فعلاً)
// المبالغ تُقرّب على مستوى كل سطر (خانات العملة)، والإجماليات = مجموع السطور
// ============================================================

// تقريب لعدد خانات معيّن
export const round = (value, decimals = 2) => {
  const f = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * f) / f;
};

const sum = (list, key) => list.reduce((s, x) => s + (x[key] ?? 0), 0);

// قيمة الخصم من مبلغ: نسبة أو مبلغ ثابت (لا يتجاوز المبلغ نفسه)
export function discountOf(base, type, value, decimals = 2) {
  const v = Math.max(0, Number(value) || 0);
  const raw = type === "percent" ? (base * Math.min(v, 100)) / 100 : v;
  return Math.min(round(raw, decimals), Math.max(0, base));
}

// الصافي والضريبة والإجمالي من مبلغ بعد الخصم
function applyTax(amount, rate, taxMode, decimals) {
  if (taxMode === "inclusive") {
    const net = round(amount / (1 + rate / 100), decimals);
    return { net, tax: round(amount - net, decimals), total: amount };
  }
  const tax = round((amount * rate) / 100, decimals);
  return { net: amount, tax, total: round(amount + tax, decimals) };
}

// ------------------------------------------------------------
// حساب فاتورة كاملة
// items: [{ qty, price, discountType, discountValue, taxRate, ...أي بيانات أخرى }]
//   taxMode في السطر (اختياري): وضع ضريبة خاص بالصنف (المبيعات: كل صنف
//   حسب شاشته شامل أو غير شامل)، وإلا وضع الفاتورة
// يرجع: { lines: [...items + المبالغ], totals }
// ------------------------------------------------------------
export function calcInvoice({
  items,
  taxMode = "exclusive",
  discountType = "amount",
  discountValue = 0,
  decimals = 2,
}) {
  const d = decimals;

  // 1) كل سطر: الإجمالي وخصم الصنف
  const lines = items.map((it) => {
    const qty = Number(it.qty) || 0;
    const price = Number(it.price) || 0;
    const gross = round(qty * price, d);
    const itemDiscount = discountOf(
      gross,
      it.discountType,
      it.discountValue,
      d,
    );
    return {
      ...it,
      gross,
      itemDiscount,
      afterItem: round(gross - itemDiscount, d),
    };
  });

  // 2) خصم الفاتورة وتوزيعه على السطور حسب قيمة كل سطر
  const base = round(sum(lines, "afterItem"), d);
  const invoiceDiscount = discountOf(base, discountType, discountValue, d);

  // آخر سطر له قيمة يأخذ الباقي (حتى يكون مجموع الأنصبة = الخصم بالظبط)
  let lastIndex = -1;
  lines.forEach((l, i) => {
    if (l.afterItem > 0) lastIndex = i;
  });

  let allocated = 0;
  const result = lines.map((l, i) => {
    let share = 0;
    if (invoiceDiscount > 0 && l.afterItem > 0) {
      share =
        i === lastIndex
          ? round(invoiceDiscount - allocated, d)
          : round((invoiceDiscount * l.afterItem) / base, d);
      share = Math.min(share, l.afterItem);
      allocated = round(allocated + share, d);
    }

    // 3) الضريبة (وضع السطر لو موجود، وإلا وضع الفاتورة)
    const mode = l.taxMode ?? taxMode;
    const rate = mode === "none" ? 0 : Number(l.taxRate) || 0;
    const amount = round(l.afterItem - share, d);
    const { net, tax, total } = applyTax(amount, rate, mode, d);

    return { ...l, taxRate: rate, invoiceDiscount: share, net, tax, total };
  });

  return { lines: result, totals: totalsOf(result, d) };
}

// إجماليات مجموعة سطور
export function totalsOf(lines, decimals = 2) {
  const d = decimals;
  return {
    subtotal: round(sum(lines, "gross"), d),
    itemsDiscount: round(sum(lines, "itemDiscount"), d),
    invoiceDiscount: round(sum(lines, "invoiceDiscount"), d),
    net: round(sum(lines, "net"), d),
    tax: round(sum(lines, "tax"), d),
    total: round(sum(lines, "total"), d),
  };
}

// ------------------------------------------------------------
// سطر مرتجع من سطر أصلي
// original: السطر الأصلي { qty, price, itemDiscount, invoiceDiscount, net, tax, total }
// returned: ما رُجّع منه قبل ذلك (نفس الحقول، أصفار لو لا يوجد)
// qty: الكمية المرتجعة الآن
// - لو يرجّع كل الباقي: يأخذ الباقي من المبالغ بالظبط (بدون فروق تقريب)
// - غير ذلك: بنسبة الكمية من السطر الأصلي
// ------------------------------------------------------------
const QTY_SCALE = 1000; // الكميات بـ 3 خانات عشرية

export const sameQty = (a, b) =>
  Math.round(Number(a) * QTY_SCALE) === Math.round(Number(b) * QTY_SCALE);

export const qtyMinus = (a, b) => round(Number(a) - Number(b), 3);

export function calcReturnLine(original, returned, qty, decimals = 2) {
  const d = decimals;
  const remaining = qtyMinus(original.qty, returned.qty ?? 0);
  const gross = round(qty * original.price, d);

  if (sameQty(qty, remaining)) {
    const rest = (key) => round((original[key] ?? 0) - (returned[key] ?? 0), d);
    return {
      qty,
      gross,
      itemDiscount: rest("itemDiscount"),
      invoiceDiscount: rest("invoiceDiscount"),
      net: rest("net"),
      tax: rest("tax"),
      total: rest("total"),
    };
  }

  const ratio = qty / Number(original.qty);
  const part = (key) => round((original[key] ?? 0) * ratio, d);
  const net = part("net");
  const tax = part("tax");
  return {
    qty,
    gross,
    itemDiscount: part("itemDiscount"),
    invoiceDiscount: part("invoiceDiscount"),
    net,
    tax,
    total: round(net + tax, d),
  };
}
