// ============================================================
// باركود الميزان (الأصناف الموزونة)
// نفس إعدادات برنامج الميزان (Barcode for Cash Register):
//   EAN13 (13 رقم):  علامة + كود الصنف + الوزن/السعر + رقم تحقق
//     2+5+5+1 | 2+6+4+1 | 2+4+6+1 | 1+6+5+1 | 1+5+6+1
//   EAN128 (18 رقم): علامة + كود الصنف + الوزن + الإجمالي + رقم تحقق
//     2+5+5+5+1 | 2+6+4+5+1 | 2+4+6+5+1 | 1+6+5+5+1 | 1+5+6+5+1
// مثال 1+6+5+1، علامة 1، الوزن بـ 3 خانات عشرية:
//   1 000123 01255 C ← الصنف كوده 000123، الكمية 1.255 كجم
// ============================================================

export const SCALE_FORMATS = [
  "2+5+5+1",
  "2+6+4+1",
  "2+4+6+1",
  "1+6+5+1",
  "1+5+6+1",
  "2+5+5+5+1",
  "2+6+4+5+1",
  "2+4+6+5+1",
  "1+6+5+5+1",
  "1+5+6+5+1",
];

export const SCALE_VALUE_TYPES = ["weight", "total"]; // وزن/عدد | الإجمالي (السعر)

export const DEFAULT_SCALE = {
  scaleEnabled: false,
  scaleFormat: "1+6+5+1",
  scaleFlag: "1",
  scaleValueType: "weight",
  scaleWeightDecimals: 3,
  scaleMoneyDecimals: 2,
};

// رقم التحقق القياسي (GS1 mod 10) - نفس EAN13 وEAN128
function checkDigit(body) {
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += Number(body[i]) * w;
  }
  return (10 - (sum % 10)) % 10;
}

// الأجزاء: [علامة، صنف، قيمة1، (قيمة2)، تحقق]
const partsOf = (format) => String(format).split("+").map(Number);

export const scaleLength = (format) =>
  partsOf(format).reduce((s, n) => s + n, 0);

// يرجّع { itemCode, value, total } أو null لو الباركود مش باركود ميزان
// value: الوزن/العدد (أو الإجمالي في نوع "total") كرقم عادي بعد الخانات العشرية
export function parseScaleBarcode(code, s = DEFAULT_SCALE) {
  if (!s?.scaleEnabled) return null;
  const text = String(code ?? "").trim();
  const parts = partsOf(s.scaleFormat);
  if (parts.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  if (!/^\d+$/.test(text) || text.length !== scaleLength(s.scaleFormat))
    return null;

  const [flagLen, itemLen, valLen] = parts;
  const extraLen = parts.length === 5 ? parts[3] : 0;
  const flag = text.slice(0, flagLen);
  if (flag !== String(s.scaleFlag ?? "").padStart(flagLen, "0")) return null;
  // رقم التحقق
  if (checkDigit(text.slice(0, -1)) !== Number(text.at(-1))) return null;

  let i = flagLen;
  const itemCode = text.slice(i, (i += itemLen));
  const rawValue = Number(text.slice(i, (i += valLen)));
  const rawExtra = extraLen ? Number(text.slice(i, (i += extraLen))) : null;

  const wDec = Number(s.scaleWeightDecimals ?? 3);
  const mDec = Number(s.scaleMoneyDecimals ?? 2);
  // 18 رقم: الجزء التالت وزن والرابع إجمالي
  if (extraLen) {
    return {
      itemCode,
      weight: rawValue / 10 ** wDec,
      total: rawExtra / 10 ** mDec,
    };
  }
  return s.scaleValueType === "total"
    ? { itemCode, weight: null, total: rawValue / 10 ** mDec }
    : { itemCode, weight: rawValue / 10 ** wDec, total: null };
}

// كمية الصنف من الباركود (بالوحدة الأساسية - كيلو مثلاً)
// الوزن موجود ← هو الكمية، الإجمالي بس ← الإجمالي ÷ سعر الوحدة
export function scaleQty(parsed, unitPrice) {
  if (!parsed) return null;
  if (parsed.weight != null && parsed.weight > 0)
    return Math.round(parsed.weight * 1000) / 1000;
  if (parsed.total != null && unitPrice > 0)
    return Math.round((parsed.total / unitPrice) * 1000) / 1000;
  return null;
}
