// ============================================================
// التصفير: الحاجات اللي ينفع تتمسح (مشترك بين الشاشة والسيرفر)
// - requires: لو اخترت ده، لازم دول يتمسحوا معاه (مربوطين بيه في قاعدة البيانات)
//   مثال: الأصناف ← لازم الفواتير والتحويلات والجرد يتمسحوا الأول
// - sequences: الترقيم اللي ينفع يرجع من 1 لما النوع ده يتمسح كله
// - الإعدادات وبيانات الشركة والدخول والأمان والمستخدمين والفروع والمستودعات
//   والربط مع الزكاة: برا التصفير خالص (PROTECTED للعرض بس)
// ============================================================

export const RESET_GROUPS = ["documents", "stock", "master"];

export const RESET_ITEMS = [
  // ---------- المستندات ----------
  {
    key: "sales",
    group: "documents",
    requires: ["saleReturns"],
    sequences: ["sale", "booking"],
  },
  {
    key: "saleReturns",
    group: "documents",
    requires: [],
    sequences: ["sale_return"],
  },
  {
    key: "quotations",
    group: "documents",
    requires: [],
    sequences: ["quotation"],
  },
  {
    key: "purchases",
    group: "documents",
    requires: ["purchaseReturns"],
    sequences: ["purchase"],
  },
  {
    key: "purchaseReturns",
    group: "documents",
    requires: [],
    sequences: ["purchase_return"],
  },
  {
    key: "vouchers",
    group: "documents",
    requires: [],
    sequences: ["receipt", "payment", "settlement"],
  },
  { key: "shifts", group: "documents", requires: [], sequences: ["shift"] },

  // ---------- المخزون ----------
  { key: "transfers", group: "stock", requires: [], sequences: ["transfer"] },
  // الجرد + التوالف والزيادات
  {
    key: "counts",
    group: "stock",
    requires: [],
    sequences: ["count", "adjustment"],
  },
  { key: "openingStock", group: "stock", requires: [], sequences: [] },

  // ---------- البيانات الأساسية ----------
  {
    key: "products",
    group: "master",
    requires: [
      "sales",
      "saleReturns",
      "quotations",
      "purchases",
      "purchaseReturns",
      "transfers",
      "counts",
      "openingStock",
    ],
    sequences: [],
  },
  { key: "categories", group: "master", requires: ["products"], sequences: [] },
  { key: "units", group: "master", requires: ["products"], sequences: [] },
  { key: "priceLists", group: "master", requires: [], sequences: [] },
  { key: "promotions", group: "master", requires: [], sequences: [] },
  {
    key: "customers",
    group: "master",
    requires: ["sales", "saleReturns", "quotations", "vouchers"],
    sequences: [],
  },
  {
    key: "suppliers",
    group: "master",
    requires: ["purchases", "purchaseReturns", "vouchers"],
    sequences: [],
  },
  { key: "openingBalances", group: "master", requires: [], sequences: [] },
  {
    key: "expenseCategories",
    group: "master",
    requires: ["vouchers"],
    sequences: [],
  },
];

export const RESET_KEYS = RESET_ITEMS.map((i) => i.key);

// اللي مش بيتصفّر أبداً (للعرض في الشاشة)
export const PROTECTED_ITEMS = [
  "company",
  "systemSettings",
  "printing",
  "currencies",
  "paymentMethods",
  "zatca",
  "loginSecurity",
  "users",
  "branches",
  "warehouses",
];

const byKey = new Map(RESET_ITEMS.map((i) => [i.key, i]));

// الاختيار + كل اللي لازم يتمسح معاه (بالتسلسل)
export function expandSelection(keys) {
  const out = new Set();
  const visit = (k) => {
    if (out.has(k) || !byKey.has(k)) return;
    out.add(k);
    byKey.get(k).requires.forEach(visit);
  };
  keys.forEach(visit);
  return out;
}

// العناصر اللي بتحتاج الحاجة دي (عشان الشاشة تمنع إلغاء الاختيار)
export function requiredBy(key, selected) {
  return RESET_ITEMS.filter(
    (i) =>
      selected.has(i.key) && i.key !== key && expandSelection([i.key]).has(key),
  ).map((i) => i.key);
}
