// ============================================================
// أرقام المستندات: كل نوع له مسلسل مستقل، ويظهر ببادئة تميّزه
//   فاتورة شراء  ← PI-15
//   مرتجع مشتريات ← PR-7
//   تحويل مخزني   ← TR-3
//   جرد           ← IC-2
//   فاتورة بيع    ← SI-1 / مرتجع مبيعات ← SR-1 / عرض سعر ← QT-1 / وردية ← SH-1
// (في قاعدة البيانات الرقم فقط، والبادئة للعرض والطباعة والبحث)
// ============================================================

export const DOC_PREFIX = {
  purchase: "PI",
  return: "PR",
  transfer: "TR",
  count: "IC",
  sale: "SI",
  saleReturn: "SR",
  quotation: "QT",
  shift: "SH",
  receipt: "RV",
  payment: "PV",
  settlement: "ST",
  // طلب ضمان / صيانة
  claim: "WC",
  // عقد صيانة دورية
  contract: "MC",
  // التوالف والزيادات
  adjustment: "AJ",
  // الحجوزات
  booking: "BK",
};

// رقم فاتورة بيع أو مرتجع مبيعات (النوع في جدول المبيعات: sale / return)
export const saleDocNo = (type, number) =>
  formatDocNo(type === "return" ? "saleReturn" : "sale", number);

// (purchase, 15) ← "PI-15"
export const formatDocNo = (type, number) =>
  number == null ? "" : `${DOC_PREFIX[type] ?? ""}-${number}`;

// "PI-15" أو "pi15" أو "15" ← 15 (أو null لو ليس رقم مستند)
export function parseDocNo(value) {
  const m = String(value ?? "")
    .trim()
    .match(/^(?:[a-z]{2}\s*-?\s*)?(\d{1,9})$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n < 2_147_483_647 ? n : null;
}

// حالة السداد: مدفوعة / مدفوعة جزئياً / آجل بالكامل
export function paymentStatus(total, paid) {
  if (paid <= 0 && total > 0) return "credit";
  if (paid < total) return "partial";
  return "paid";
}

export const PAYMENT_STATUS_COLOR = {
  paid: "green",
  partial: "gold",
  credit: "orange",
};
