// ============================================================
// بنود الإشعارات الدائنة والمدينة (للعملاء والموردين) - المتصفح والسيرفر
// - product: السطر صنف (تصحيح سعر): كمية × فرق السعر، من غير حركة مخزون
// - غير كده: بند حر بوصف ومبلغ (خصم، رسوم شحن، تخزين ...)
// - credit / debit: البند يظهر في أنهي نوع إشعار
// ============================================================

export const NOTE_LINE_KINDS = [
  {
    key: "price",
    ar: "تصحيح سعر صنف",
    en: "Item price correction",
    product: true,
    credit: true,
    debit: true,
  },
  {
    key: "discount",
    ar: "خصم على الفاتورة",
    en: "Invoice discount",
    credit: true,
  },
  {
    key: "rebate",
    ar: "خصم كمية / حافز مبيعات",
    en: "Volume rebate / incentive",
    credit: true,
  },
  {
    key: "amount",
    ar: "تصحيح قيمة الفاتورة",
    en: "Invoice amount correction",
    credit: true,
    debit: true,
  },
  {
    key: "shipping",
    ar: "رسوم شحن",
    en: "Shipping fees",
    credit: true,
    debit: true,
  },
  {
    key: "delivery",
    ar: "رسوم توصيل",
    en: "Delivery fees",
    credit: true,
    debit: true,
  },
  {
    key: "storage",
    ar: "رسوم تخزين",
    en: "Storage fees",
    credit: true,
    debit: true,
  },
  {
    key: "install",
    ar: "رسوم تركيب",
    en: "Installation fees",
    credit: true,
    debit: true,
  },
  {
    key: "packing",
    ar: "رسوم تغليف",
    en: "Packing fees",
    credit: true,
    debit: true,
  },
  {
    key: "service",
    ar: "خدمة إضافية",
    en: "Additional service",
    debit: true,
  },
  {
    key: "penalty",
    ar: "غرامة تأخير",
    en: "Late payment penalty",
    debit: true,
  },
  {
    key: "compensation",
    ar: "تعويض عن تلف أو تأخير",
    en: "Compensation for damage or delay",
    credit: true,
  },
  { key: "other", ar: "أخرى", en: "Other", credit: true, debit: true },
];

export const NOTE_LINE_KEYS = NOTE_LINE_KINDS.map((k) => k.key);

const byKey = new Map(NOTE_LINE_KINDS.map((k) => [k.key, k]));
export const noteLineKind = (key) => byKey.get(key) ?? null;

// البنود المتاحة لنوع إشعار (credit / debit)
export const noteLineKindsFor = (type) =>
  NOTE_LINE_KINDS.filter((k) => k[type]);

// البند متاح في النوع ده؟
export const noteLineAllowed = (type, key) => Boolean(byKey.get(key)?.[type]);

// ------------------------------------------------------------
// البنود اللي بيضيفها المستخدم (جدول note_line_items): المفتاح "c" + رقم البند
// ------------------------------------------------------------
export const CUSTOM_KIND = /^c\d{1,9}$/;
export const isCustomKind = (key) => CUSTOM_KIND.test(String(key ?? ""));
export const customKindKey = (id) => `c${id}`;
export const customKindId = (key) =>
  isCustomKind(key) ? Number(String(key).slice(1)) : null;
