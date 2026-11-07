// ============================================================
// حساب المطعم (نفس الحساب في الكاشير والسيرفر)
// - سعر السطر: سعر الحجم (أو الصنف) ← في التطبيق: السعر الخاص أو + زيادة التطبيق
//   + أسعار الإضافات المختارة
// - الرسوم (كل واحدة سطر في الفاتورة، السعر من غير ضريبة):
//   التبغ = نسبة × صافي أصناف التبغ
//   الخدمة = نسبة × صافي الأصناف (المحلي بس لو الإعداد كده، ومش على التطبيقات)
//   التوصيل = المبلغ (طلبات التوصيل بس)
// ============================================================

// local محلي من غير طاولة | dinein طاولات | takeaway سفري | delivery توصيل | app تطبيق
export const ORDER_TYPES = ["local", "dinein", "takeaway", "delivery", "app"];

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// سعر الصنف في التطبيق من غير سعر خاص: السعر + الزيادة (نسبة أو مبلغ)
export function channelPrice(price, channel) {
  const v = Number(channel?.markupValue) || 0;
  if (!channel || !v) return r2(price);
  return r2(
    channel.markupType === "percent"
      ? Number(price) * (1 + v / 100)
      : Number(price) + v,
  );
}

// سعر الوحدة للسطر
// item: { price, sizes:[{sizeId, price}], channelPrices:[{channelId,sizeId,price}] }
// modifiers: الإضافات المختارة [{price}]
export function linePrice(item, sizeId, modifiers, channel) {
  const size = sizeId ? item.sizes.find((s) => s.sizeId === sizeId) : null;
  const base = size ? size.price : item.price;
  let unit = base;
  if (channel) {
    const special = item.channelPrices.find(
      (p) => p.channelId === channel.id && p.sizeId === (sizeId || 0),
    );
    unit = special ? special.price : channelPrice(base, channel);
  }
  const extra = modifiers.reduce((s, m) => s + (Number(m.price) || 0), 0);
  return r2(unit + extra);
}

// إجمالي السطر بالضريبة (الخصم على السطر محسوب): أساس نسب الرسوم
// (الرسوم كلها شاملة الضريبة: طلب 40 + خدمة 10% = 44)
export function lineGross({ price, qty, taxRate, inclusive, discount = 0 }) {
  const base = Number(price) * Number(qty) - (Number(discount) || 0);
  const rate = Number(taxRate) || 0;
  return inclusive || !rate ? base : base * (1 + rate / 100);
}

// الرسوم: { service, delivery, tobacco } (صفر = مفيش سطر) + هل المبلغ شامل الضريبة
// lines: [{ amount (إجمالي السطر بالضريبة), qty, isTobacco }]
// الرسوم كلها شاملة الضريبة (الضريبة جوه المبلغ مش فوقه):
// - النسبة: من إجمالي الأصناف بالضريبة (طلب 40 + خدمة 10% = 44)
// - المبلغ: الخدمة على الطلب، التبغ على كل وحدة (شيشة 25 + رسوم 25 = 50)، التوصيل على الطلب
export function restaurantFees(
  lines,
  {
    orderType,
    serviceType = "percent",
    servicePercent,
    deliveryFee,
    tobaccoType = "percent",
    tobaccoPercent,
    serviceDineInOnly,
  },
) {
  const all = lines.reduce((s, l) => s + l.amount, 0);
  const tobaccoLines = lines.filter((l) => l.isTobacco);
  const tobaccoNet = tobaccoLines.reduce((s, l) => s + l.amount, 0);
  const tobaccoQty = tobaccoLines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const serviceAllowed =
    orderType !== "app" &&
    (!serviceDineInOnly || orderType === "local" || orderType === "dinein");
  const sv = Number(servicePercent) || 0;
  const tv = Number(tobaccoPercent) || 0;
  return {
    tobacco:
      tobaccoType === "amount" ? r2(tobaccoQty * tv) : r2((tobaccoNet * tv) / 100),
    service: !serviceAllowed
      ? 0
      : serviceType === "amount"
        ? all > 0
          ? r2(sv)
          : 0
        : r2((all * sv) / 100),
    delivery: orderType === "delivery" ? r2(deliveryFee) : 0,
    // كلها شاملة الضريبة (نسبة أو مبلغ)
    inclusive: { tobacco: true, service: true, delivery: true },
  };
}

// سعر سطر الرسوم: أصناف الرسوم سعرها شامل الضريبة ← المبلغ زي ما هو
// (التحويل لمبلغ من غير ضريبة وبعدين إضافتها كان بيعمل فرق هللة: 125.01)
export function feeLinePrice(amount) {
  return Math.round(Number(amount) * 100) / 100;
}

// عدد الحبات (السمك...): «3 حبات» (بالعربي عشان الفاتورة والتحضير)
export const piecesText = (n) =>
  n === 1 ? "حبة واحدة" : n === 2 ? "حبتين" : n <= 10 ? `${n} حبات` : `${n} حبة`;

// وصف السطر في الفاتورة والمطبخ: الحجم · الإضافات · الملاحظة
export function lineNote(sizeName, modifierNames, notes) {
  return [sizeName, modifierNames.join("، "), notes]
    .filter((x) => x && String(x).trim())
    .join(" · ");
}
