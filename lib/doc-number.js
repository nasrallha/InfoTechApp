// ============================================================
// أرقام المستندات: كل نوع له مسلسل مستقل، ويظهر ببادئة تميّزه
//   فاتورة شراء  ← PI-15
//   مرتجع مشتريات ← PR-7
//   تحويل مخزني   ← TR-3
//   جرد           ← IC-2
//   فاتورة بيع    ← SI-1 / مرتجع مبيعات ← SR-1 / عرض سعر ← QT-1 / وردية ← SH-1
//   إشعار دائن ← CN-1 / إشعار مدين ← DN-1 (للعميل)
//   إشعار دائن من مورد ← PC-1 / إشعار مدين من مورد ← PD-1
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
  // سند مقاصة (عميل هو مورد)
  offset: "OF",
  // طلب ضمان / صيانة
  claim: "WC",
  // عقد صيانة دورية
  contract: "MC",
  // التوالف والزيادات
  adjustment: "AJ",
  // الحجوزات
  booking: "BK",
  // الإشعارات: دائن / مدين للعميل، ودائن / مدين من المورد
  saleCredit: "CN",
  saleDebit: "DN",
  purchaseCredit: "PC",
  purchaseDebit: "PD",
};

// نوع المستند في جدول المبيعات ← نوع البادئة
const SALE_PREFIX = {
  sale: "sale",
  return: "saleReturn",
  credit: "saleCredit",
  debit: "saleDebit",
};
const PURCHASE_PREFIX = {
  purchase: "purchase",
  return: "return",
  credit: "purchaseCredit",
  debit: "purchaseDebit",
};

// رقم مستند في جدول المبيعات (sale / return / credit / debit)
export const saleDocNo = (type, number) =>
  formatDocNo(SALE_PREFIX[type] ?? "sale", number);

// رقم مستند في جدول المشتريات (purchase / return / credit / debit)
export const purchaseDocNo = (type, number) =>
  formatDocNo(PURCHASE_PREFIX[type] ?? "purchase", number);

// اتجاه المستند في التقارير والأرصدة: المرتجع والإشعار الدائن بالسالب
export const NOTE_TYPES = ["credit", "debit"];
export const isNoteType = (type) => NOTE_TYPES.includes(type);
export const docSign = (type) =>
  type === "return" || type === "credit" ? -1 : 1;

// رابط عرض المستند حسب نوعه
export const saleDocHref = (type, id) =>
  isNoteType(type)
    ? `/invoices/sales-notes/${id}`
    : `/invoices/${type === "return" ? "sales-returns" : "sales"}/${id}`;
export const purchaseDocHref = (type, id) =>
  isNoteType(type)
    ? `/invoices/purchase-notes/${id}`
    : `/invoices/${type === "return" ? "purchase-returns" : "purchases"}/${id}`;

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
