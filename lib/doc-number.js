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
// المبيعات والمشتريات والسندات وعروض الأسعار: الترقيم لكل فرع، ورمز الفرع قبل الرقم
//   DM-SI-5 (docCode = DM) - المستندات اللي قبل ترقيم الفروع من غير رمز (SI-5)
// الترقيم لكل سنة مالية (من أول السنة بيبدأ من 1): الفرع - النوع - السنة - الرقم
//   DM-SI-2026-15 (docCode = 2026DM: السنة + رمز الفرع) - المستندات اللي قبلها بشكلها القديم
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
  // عقد إيجار (وحدة realEstate)
  rentContract: "RC",
  // طلب تفصيل (وحدة tailoring)
  tailorOrder: "TO",
  // عقد مقاولات (وحدة contracting)
  constructionContract: "CT",
  // مستخلص مقاولات (عقد أو سريع): مسلسل واحد
  constructionCertificate: "CR",
  // اشتراك المغسلة
  laundryWallet: "LW",
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
// code: رمز الفرع المحفوظ مع المستند (docCode)
export const saleDocNo = (type, number, code = null) =>
  formatDocNo(SALE_PREFIX[type] ?? "sale", number, code);

// رقم مستند في جدول المشتريات (purchase / return / credit / debit)
export const purchaseDocNo = (type, number, code = null) =>
  formatDocNo(PURCHASE_PREFIX[type] ?? "purchase", number, code);

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

// docCode للسنة المالية: «السنة + رمز الفرع» (2026DM) ← { year: 2026, branch: "DM" }
const YEAR_CODE_RE = /^(\d{4})([A-Z][A-Z0-9]{0,5})$/;
export const splitDocCode = (code) => {
  const m = YEAR_CODE_RE.exec(code ?? "");
  return m ? { year: Number(m[1]), branch: m[2] } : { year: null, branch: code ?? null };
};

// (purchase, 15) ← "PI-15"
// code: رمز المستند وقت الترقيم (docCode):
//   «2026DM» ← "DM-PI-2026-15" (لكل سنة مالية) | «DM» ← "DM-PI-15" | من غير رمز ← "PI-15"
export const formatDocNo = (type, number, code = null) => {
  if (number == null) return "";
  const { year, branch } = splitDocCode(code);
  return `${branch ? `${branch}-` : ""}${DOC_PREFIX[type] ?? ""}-${year ? `${year}-` : ""}${number}`;
};

// رمز الفرع: حروف إنجليزي كبيرة وأرقام (أوله حرف)، لحد 6
export const BRANCH_CODE_RE = /^[A-Z][A-Z0-9]{0,5}$/;

const KNOWN_PREFIXES = new Set(Object.values(DOC_PREFIX));

// رقم مستند مكتوب ← { code, year, number }
//   "DM-SI-2026-15" ← { code: "DM", year: 2026, number: 15 }
//   "SI-2026-15" / "2026-15" ← { code: null, year: 2026, number: 15 }
//   "DM-SI-15" ← { code: "DM", number: 15 }
//   "SI-15" / "si15" / "15" ← { code: null, number: 15 }
//   "DM-15" ← { code: "DM", number: 15 }
// (null لو مش رقم مستند)
export function parseDocRef(value) {
  const s = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const num = (x) => {
    const n = Number(x);
    return /^\d{1,9}$/.test(x) && n > 0 && n < 2_147_483_647 ? n : null;
  };
  const parts = s.split("-").filter(Boolean);
  const isYear = (x) => /^\d{4}$/.test(x) && Number(x) >= 2000 && Number(x) <= 2999;
  // الشكل الجديد (بالسنة المالية)
  if (parts.length === 4) {
    const n = num(parts[3]);
    return n && BRANCH_CODE_RE.test(parts[0]) && KNOWN_PREFIXES.has(parts[1]) && isYear(parts[2])
      ? { code: parts[0], year: Number(parts[2]), number: n }
      : null;
  }
  if (parts.length === 3 && isYear(parts[1])) {
    const n = num(parts[2]);
    if (!n) return null;
    // "SI-2026-15" أو "DM-2026-15"
    if (KNOWN_PREFIXES.has(parts[0])) return { code: null, year: Number(parts[1]), number: n };
    return BRANCH_CODE_RE.test(parts[0]) ? { code: parts[0], year: Number(parts[1]), number: n } : null;
  }
  if (parts.length === 2 && isYear(parts[0])) {
    const n = num(parts[1]);
    return n ? { code: null, year: Number(parts[0]), number: n } : null;
  }
  if (parts.length === 3) {
    const n = num(parts[2]);
    return n && BRANCH_CODE_RE.test(parts[0]) && KNOWN_PREFIXES.has(parts[1])
      ? { code: parts[0], number: n }
      : null;
  }
  if (parts.length === 2) {
    const n = num(parts[1]);
    if (!n) return null;
    if (KNOWN_PREFIXES.has(parts[0])) return { code: null, number: n };
    return BRANCH_CODE_RE.test(parts[0]) ? { code: parts[0], number: n } : null;
  }
  // "si15" أو "15"
  const m = s.match(/^(?:[A-Z]{2})?(\d{1,9})$/);
  const n = m ? num(m[1]) : null;
  return n ? { code: null, number: n } : null;
}

// "PI-15" أو "DM-PI-15" أو "pi15" أو "15" ← 15 (أو null لو ليس رقم مستند)
export function parseDocNo(value) {
  return parseDocRef(value)?.number ?? null;
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
