// ============================================================
// التصفير: الحاجات اللي ينفع تتمسح (مشترك بين الشاشة والسيرفر)
// - requires: لو اخترت ده، لازم دول يتمسحوا معاه (مربوطين بيه في قاعدة البيانات)
//   مثال: الأصناف ← لازم الفواتير والتحويلات والجرد يتمسحوا الأول
// - sequences: الترقيم اللي ينفع يرجع من 1 لما النوع ده يتمسح كله
// - الإعدادات وبيانات الشركة والدخول والأمان والمستخدمين والفروع والمستودعات
//   والربط مع الزكاة: برا التصفير خالص (PROTECTED للعرض بس)
// - module: البند ده لوحدة نشاط (بيظهر بس لو مفعّلة للشركة)
// - hideFor: مش بيظهر في الأنشطة دي (الشاشات اللي النشاط مبيستخدمهاش)
//   (لو مطلوب مع بند ظاهر بيتمسح معاه برضه، وغالباً بيكون فاضي)
// ============================================================

export const RESET_GROUPS = ["documents", "activity", "stock", "master", "people"];

// الأنشطة اللي من غير مخزون / أصناف / كاشير (نفس القائمة الجانبية)
const NO_STOCK = ["contracting", "realEstate", "laundry"];
const NO_ITEMS = ["contracting", "realEstate"];
const NO_SHIFTS = ["realEstate", "tailoring", "contracting"];

// مستندات الأنشطة (بتتمسح مع الفواتير / العملاء المربوطة بيهم)
const ACTIVITY_KEYS = [
  "construction",
  "rentContracts",
  "tailorOrders",
  "laundry",
  "restaurantOrders",
  "bookings",
  "maintenanceContracts",
  "warrantyClaims",
  "followUps",
];
// كل المستندات (الفروع: بتتمسح بعد مستندات الفروع اللي هتتمسح)
const ALL_DOCS = [
  "sales",
  "saleReturns",
  "quotations",
  "purchases",
  "purchaseReturns",
  "vouchers",
  "shifts",
  "transfers",
  "counts",
  ...ACTIVITY_KEYS,
];

export const RESET_ITEMS = [
  // ---------- المستندات ----------
  {
    key: "sales",
    group: "documents",
    requires: ["saleReturns", ...ACTIVITY_KEYS],
    sequences: ["sale", "booking"],
  },
  {
    key: "saleReturns",
    group: "documents",
    requires: [],
    sequences: ["sale_return", "sale_credit", "sale_debit"],
  },
  {
    key: "quotations",
    group: "documents",
    requires: [],
    sequences: ["quotation"],
    hideFor: ["laundry", "realEstate", "contracting"],
  },
  {
    key: "purchases",
    group: "documents",
    requires: ["purchaseReturns", "construction"],
    sequences: ["purchase"],
  },
  {
    key: "purchaseReturns",
    group: "documents",
    requires: [],
    sequences: ["purchase_return", "purchase_credit", "purchase_debit"],
  },
  {
    key: "vouchers",
    group: "documents",
    requires: [],
    sequences: ["receipt", "payment", "settlement", "offset"],
  },
  { key: "shifts", group: "documents", requires: [], sequences: ["shift"], hideFor: NO_SHIFTS },

  // ---------- مستندات الأنشطة ----------
  // المقاولات: العقود والمستخلصات وأوامر التغيير والتحصيل
  {
    key: "construction",
    group: "activity",
    module: "contracting",
    requires: [],
    sequences: ["construction_contract", "construction_certificate"],
  },
  // تأجير العقارات: العقود والدفعات
  { key: "rentContracts", group: "activity", module: "realEstate", requires: [], sequences: ["rent_contract"] },
  // الخياط: طلبات التفصيل
  { key: "tailorOrders", group: "activity", module: "tailoring", requires: [], sequences: ["tailor_order"] },
  // المغسلة: الطلبات والاشتراكات
  { key: "laundry", group: "activity", module: "laundry", requires: [], sequences: ["LW"] },
  // المطعم: الطلبات (الطاولات والمطبخ والتوصيل) - الترقيم اليومي بيبدأ لوحده كل يوم
  { key: "restaurantOrders", group: "activity", module: "restaurant", requires: [], sequences: [] },
  // الحجوزات والمواعيد
  { key: "bookings", group: "activity", module: "bookings", requires: [], sequences: ["booking"] },
  // عقود الصيانة الدورية (الزيارات معاها)
  {
    key: "maintenanceContracts",
    group: "activity",
    module: "maintenanceContracts",
    requires: [],
    sequences: ["maintenance_contract"],
  },
  // طلبات الضمان والصيانة
  { key: "warrantyClaims", group: "activity", module: "warrantyClaims", requires: [], sequences: ["warranty_claim"] },
  // المتابعات الدورية (الفلاتر والتحلية)
  { key: "followUps", group: "activity", module: "followUps", requires: [], sequences: [] },

  // ---------- المخزون ----------
  { key: "transfers", group: "stock", requires: [], sequences: ["transfer"], hideFor: NO_STOCK },
  // الجرد + التوالف والزيادات
  {
    key: "counts",
    group: "stock",
    requires: [],
    sequences: ["count", "adjustment"],
    hideFor: NO_STOCK,
  },
  { key: "openingStock", group: "stock", requires: [], sequences: [], hideFor: NO_STOCK },

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
      "bookings",
      "warrantyClaims",
    ],
    sequences: [],
    hideFor: NO_ITEMS,
  },
  { key: "categories", group: "master", requires: ["products"], sequences: [], hideFor: [...NO_ITEMS, "laundry"] },
  { key: "units", group: "master", requires: ["products"], sequences: [], hideFor: ["realEstate"] },
  { key: "priceLists", group: "master", requires: [], sequences: [], hideFor: NO_ITEMS },
  { key: "promotions", group: "master", requires: [], sequences: [], hideFor: NO_ITEMS },
  {
    key: "customers",
    group: "people",
    requires: ["sales", "saleReturns", "quotations", "vouchers", ...ACTIVITY_KEYS],
    sequences: [],
  },
  {
    key: "suppliers",
    group: "people",
    requires: ["purchases", "purchaseReturns", "vouchers", "construction", "warrantyClaims"],
    sequences: [],
  },
  { key: "openingBalances", group: "people", requires: [], sequences: [] },
  // المستخدمين (ما عدا مدير النظام ومالك البرنامج): مستنداتهم بتتنقل لمدير النظام
  { key: "users", group: "people", requires: [], sequences: [] },
  // الفروع (ما عدا الفرع الرئيسي) والمستودعات (ما عدا الرئيسي): بعد مسح المستندات
  { key: "branches", group: "people", requires: ALL_DOCS, sequences: [] },
  {
    key: "warehouses",
    group: "people",
    requires: ["sales", "saleReturns", "purchases", "purchaseReturns", "transfers", "counts", "openingStock"],
    sequences: [],
    hideFor: NO_STOCK,
  },
  {
    key: "expenseCategories",
    group: "master",
    requires: ["vouchers"],
    sequences: [],
  },
];

export const RESET_KEYS = RESET_ITEMS.map((i) => i.key);

// البنود اللي تظهر للشركة حسب نشاطها (modules: وحدات الشركة المفعّلة)
export const visibleResetItems = (modules = []) =>
  RESET_ITEMS.filter(
    (i) => (!i.module || modules.includes(i.module)) && !(i.hideFor ?? []).some((m) => modules.includes(m)),
  );

// اللي مش بيتصفّر أبداً (للعرض في الشاشة)
export const PROTECTED_ITEMS = [
  "company",
  "systemSettings",
  "printing",
  "currencies",
  "paymentMethods",
  "zatca",
  "loginSecurity",
  "admin",
  "roles",
  "mainBranch",
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
