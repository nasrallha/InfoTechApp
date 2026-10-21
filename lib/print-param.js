// ============================================================
// "حفظ وطباعة" بمقاس يختاره المستخدم (كاشير أو A4)
// الفورم بيحفظ ويفتح شاشة المستند بـ ?print=thermal أو ?print=a4
// وشاشة المستند بتطبع على طول بالمقاس ده (?print=1 = المقاس الافتراضي من الإعدادات)
// ============================================================
export const SAVE_PRINT_THERMAL = "print-thermal";
export const SAVE_PRINT_A4 = "print-a4";

// وضع الحفظ ← الجزء اللي بيتضاف للرابط
export function printQuery(mode) {
  if (mode === SAVE_PRINT_THERMAL) return "?print=thermal";
  if (mode === SAVE_PRINT_A4) return "?print=a4";
  return "";
}

// قيمة ?print في الرابط ← autoPrint: false | true (الافتراضي) | "A4" | "thermal"
export function parsePrintParam(value) {
  if (value === "a4") return "A4";
  if (value === "thermal") return "thermal";
  return value === "1";
}
