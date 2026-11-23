// ============================================================
// فتح الدرج بعد طباعة الإيصال (حسب إعداد الجهاز)
// payments: طرق دفع المستند [{ type: cash|card|wallet|transfer|credit, amount }]
// (null = المستند مش بيع جديد ← مفيش فتح، زي إعادة الطباعة)
// mode: cash الكاش فقط | cashCard الكاش والشبكة | always كل فاتورة | never
// ============================================================
export function shouldOpenDrawer(mode, payments) {
  if (!Array.isArray(payments) || mode === "never") return false;
  if (mode === "always") return true;
  const paid = (types) => payments.some((p) => types.includes(p?.type) && Number(p.amount) > 0);
  if (mode === "cashCard") return paid(["cash", "card"]);
  return paid(["cash"]);
}

// أمر فتح الدرج (ESC p) - نبضة على السنّة 2 والسنّة 5
export const DRAWER_KICK = [0x1b, 0x70, 0x00, 0x19, 0xfa, 0x1b, 0x70, 0x01, 0x19, 0xfa];
