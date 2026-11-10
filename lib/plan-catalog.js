// ============================================================
// مميزات الباقات (المصدر الوحيد): كل ميزة = مجموعة صلاحيات
// - الميزة مش في باقة الشركة ← صلاحياتها مقفولة على الكل (حتى مدير النظام)
//   وبتفضل لمالك البرنامج بس (lib/permissions: can)
// - الشركة من غير باقة ← كل حاجة مفتوحة
// - لوحة التحكم بتقرا الملف ده (شاشة الباقات)، فأي ميزة جديدة هنا بتظهر هناك لوحدها
// ⚠ الملف ده من غير imports (اللوحة بتشغّله لوحده)
// ============================================================
const all = (group, actions) => actions.map((a) => `${group}.${a}`);

// الأدوار (إضافة / تعديل / صلاحيات) مش ميزة باقة: متاحة لمدير النظام في كل الشركات
// (ولو عايز تقفل حاجة منها: «صلاحيات مقفولة على العملاء» في اللوحة)
export const PLAN_CATALOG = [
  {
    key: "branches",
    ar: "إضافة وتعديل الفروع",
    en: "Add/edit branches",
    permissions: all("branches", ["create", "update", "delete"]),
  },
  {
    key: "warehouses",
    ar: "إضافة وتعديل المستودعات",
    en: "Add/edit warehouses",
    permissions: all("warehouses", ["create", "update", "delete"]),
  },
  {
    key: "zatca",
    ar: "الزكاة (متابعة الفواتير والإرسال والتنزيل)",
    en: "ZATCA (invoice monitoring, sending, export)",
    permissions: all("zatca", ["view", "send", "export"]),
  },
  {
    key: "purchases",
    ar: "المشتريات ومرتجعاتها وإشعارات الموردين",
    en: "Purchases, returns and supplier notes",
    permissions: [
      ...all("purchases", [
        "view",
        "create",
        "update",
        "delete",
        "changeTaxMode",
        "changeDate",
        "chooseWarehouse",
      ]),
      ...all("purchaseReturns", ["view", "create", "delete", "changeDate"]),
      ...all("purchaseNotes", [
        "view",
        "create",
        "update",
        "delete",
        "changeDate",
      ]),
      "reports.purchases",
    ],
  },
  {
    key: "inventory",
    ar: "المخزون (التحويلات والجرد والتوالف)",
    en: "Inventory (transfers, counts and damages)",
    permissions: [
      ...all("transfers", [
        "view",
        "create",
        "receive",
        "cancel",
        "changeDate",
      ]),
      ...all("inventoryCounts", ["view", "create", "post", "delete"]),
      ...all("stockAdjustments", [
        "view",
        "create",
        "update",
        "cancel",
        "changeDate",
      ]),
    ],
  },
  {
    key: "accounts",
    ar: "الحسابات (السندات وكشوف الحساب)",
    en: "Accounts (vouchers and statements)",
    permissions: [
      ...all("receipts", ["view", "create", "update", "delete", "changeDate"]),
      ...all("paymentVouchers", [
        "view",
        "create",
        "update",
        "delete",
        "changeDate",
      ]),
      ...all("settlements", [
        "view",
        "create",
        "update",
        "delete",
        "changeDate",
      ]),
      ...all("expenseCategories", ["view", "create", "update", "delete"]),
      ...all("statements", ["customers", "suppliers", "combined"]),
      ...all("offsets", ["view", "create", "delete", "changeDate"]),
    ],
  },
  {
    key: "reports",
    ar: "التقارير",
    en: "Reports",
    permissions: [
      ...all("reports", ["sales", "vat", "profit", "daily"]),
      "dashboard.finance",
    ],
  },
  {
    key: "promotions",
    ar: "العروض والخصومات",
    en: "Promotions",
    permissions: all("promotions", [
      "view",
      "create",
      "update",
      "delete",
      "activate",
    ]),
  },
  {
    key: "priceLists",
    ar: "قوائم الأسعار",
    en: "Price lists",
    permissions: all("priceLists", ["view", "create", "update", "delete"]),
  },
  {
    key: "pos",
    ar: "نقطة البيع (الكاشير والورديات)",
    en: "Point of sale (cashier and shifts)",
    permissions: [
      "sales.pos",
      ...all("shifts", ["view", "close", "cashMovement", "viewExpected"]),
    ],
  },
];

// الصلاحيات المقفولة حسب مميزات الباقة
// features: مصفوفة مفاتيح | null = من غير باقة (كل حاجة مفتوحة)
export function blockedPermissions(features) {
  if (!Array.isArray(features)) return [];
  const on = new Set(features);
  return PLAN_CATALOG.filter((f) => !on.has(f.key)).flatMap(
    (f) => f.permissions,
  );
}

// ------------------------------------------------------------
// فترة "قراءة فقط" (بعد فترة السماح): عرض وطباعة وتنزيل وتقارير بس
// كل الصلاحيات التانية (إضافة، تعديل، حذف، بيع، كاشير...) بتتقفل
// ------------------------------------------------------------
const READ_ACTIONS = new Set([
  "view",
  "print",
  "download",
  "export",
  // كشوف الحساب والتقارير
  "customers",
  "suppliers",
  "sales",
  "purchases",
  "vat",
  "profit",
  "daily",
  "finance",
  // تقرير الضمانات (الأرقام التسلسلية) وعمولات الفنيين
  "warranties",
  "commissions",
]);
// مجموعات العمليات فيها كتابة حتى لو اسمها شبه القراءة
const WRITE_GROUPS_WITH_READ_NAMES = new Set([]);

export function readonlyBlocked(allPermissions) {
  return allPermissions.filter((p) => {
    const [group, action] = p.split(".");
    if (WRITE_GROUPS_WITH_READ_NAMES.has(group)) return true;
    // statements.* و reports.* و dashboard.finance: قراءة
    if (group === "reports" || group === "statements") return false;
    return !READ_ACTIONS.has(action);
  });
}
