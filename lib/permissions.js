// ============================================================
// قائمة الصلاحيات الموجودة في النظام (المصدر الوحيد للحقيقة)
// - هذا الملف يُستخدم في السيرفر والواجهة معاً (لا يحتوي أي شيء سري)
// - الصلاحية = "المجموعة.العملية"، مثال: "products.create"
// - عند إضافة موديول جديد (مشتريات مثلاً): نضيف مجموعته هنا
//   فتظهر تلقائياً في شاشة صلاحيات الأدوار
// - أسماء المجموعات والعمليات مترجمة في messages (قسم Permissions)
// ============================================================

const CRUD = ["view", "create", "update", "delete"];

export const PERMISSION_GROUPS = [
  { key: "categories", actions: CRUD },
  { key: "units", actions: CRUD },
  { key: "products", actions: CRUD },
  // الفواتير
  // فواتير المبيعات
  // pos = شاشة الكاشير، changePrice = تغيير سعر البيع، discount = خصم،
  // belowCost = البيع بأقل من التكلفة، credit = بيع آجل (المتبقي على العميل)
  // changeDate = تاريخ سابق (بدونها: الآن)
  {
    key: "sales",
    actions: [
      ...CRUD,
      "pos",
      "changePrice",
      "discount",
      "belowCost",
      "credit",
      "changeDate",
    ],
  },
  // مرتجع المبيعات: changeDate = تاريخ سابق (بدونها: الآن)
  {
    key: "salesReturns",
    actions: ["view", "create", "delete", "changeDate"],
  },
  // إشعارات العملاء (دائن / مدين): changeDate = تاريخ سابق (بدونها: الآن)
  {
    key: "salesNotes",
    // update = تعديل الإشعار قبل توقيعه للزكاة
    actions: ["view", "create", "update", "delete", "changeDate"],
  },
  // ورديات الكاشير: view = عرض كل ورديات الفرع وتقاريرها، close = قفل وردية كاشير آخر
  {
    key: "shifts",
    // cashMovement = سحب/إضافة نقدية في الدرج، viewExpected = يشوف المفروض قبل العدّ
    actions: ["view", "close", "cashMovement", "viewExpected"],
  },
  // فواتير المشتريات: التعديل والحذف بصلاحية، وممنوعان لو على الفاتورة مرتجعات
  // changeTaxMode = تغيير وضع الضريبة في الفاتورة (شامل/غير شامل/بدون)
  // changeDate = تغيير تاريخ التسجيل (بدونها يكون تاريخ اليوم)
  {
    key: "purchases",
    actions: [
      "view",
      "create",
      "update",
      "delete",
      "changeTaxMode",
      "changeDate",
      "chooseWarehouse", // اختيار المستودع (بدونها: مستودع الفرع)
    ],
  },
  {
    key: "purchaseReturns",
    actions: ["view", "create", "delete", "changeDate"],
  }, // مرتجع المشتريات
  // إشعارات الموردين (دائن / مدين من المورد - تسجيل بس)
  {
    key: "purchaseNotes",
    actions: ["view", "create", "update", "delete", "changeDate"],
  },
  // عروض الأسعار: changePrice / discount = تغيير السعر والخصم في العرض فقط
  // (منفصلة عن صلاحيات فاتورة البيع، والسعر المعروض يتحول للفاتورة كما هو)
  {
    key: "quotations",
    actions: [...CRUD, "convert", "changePrice", "discount"],
  },
  // الأرقام التسلسلية (وحدة serials): view = البحث بالرقم وكارت القطعة،
  // warranties = تقرير الضمانات
  { key: "serials", actions: ["view", "warranties"] },
  // طلبات الضمان والصيانة (وحدة warrantyClaims): update = تعديل ونقل المراحل
  // والقطع، deliver = التسليم للعميل، cancel = إلغاء الطلب
  {
    key: "warrantyClaims",
    actions: ["view", "create", "update", "deliver", "cancel"],
  },
  // الفنيون (وحدة technicians): jobs = مواعيد التركيب والزيارات وتحديث حالتها،
  // commissions = تقرير عمولات الفنيين
  {
    key: "technicians",
    actions: [...CRUD, "jobs", "commissions"],
  },
  // عقود الصيانة الدورية (وحدة maintenanceContracts): visits = تنفيذ/تأجيل الزيارات
  {
    key: "maintenanceContracts",
    actions: ["view", "create", "update", "cancel", "visits"],
  },
  // المتابعة الدورية (وحدة followUps): update = تمت / تأجيل / إيقاف / تعديل
  { key: "followUps", actions: ["view", "update"] },
  // السيارات (وحدة vehicles - الورش)
  { key: "vehicles", actions: CRUD },
  // الحجوزات (وحدة bookings): update = تعديل ووصل/تم/لم يحضر، cancel = إلغاء
  { key: "bookings", actions: ["view", "create", "update", "cancel"] },
  // المغسلة (وحدة laundry): manage = الخدمات والإضافات وأسعار القطع
  { key: "laundry", actions: ["view", "manage"] },
  // طلبات المغسلة: create = استلام، update = تعديل الطلب وحالته (قيد التنفيذ / جاهز)
  // cancel = إلغاء الطلب (قبل الفوترة)
  { key: "laundryOrders", actions: ["view", "create", "update", "cancel"] },
  // اشتراكات المغسلة (رصيد العميل): create = اشتراك جديد، cancel = إلغاء اشتراك ما اتصرفش منه
  { key: "laundrySubscriptions", actions: ["view", "create", "cancel"] },
  // المطعم (وحدة restaurant): manage = المنيو (الأحجام والإضافات والأسعار) والسائقين والإعدادات
  { key: "restaurant", actions: ["view", "manage"] },
  { key: "customers", actions: CRUD },
  { key: "suppliers", actions: CRUD },
  { key: "branches", actions: CRUD },
  // عرض بيانات كل الفروع (المدير العام)، بدونها: فرع المستخدم فقط
  { key: "allBranches", actions: ["view"] },
  // المخزون
  { key: "warehouses", actions: CRUD }, // المستودعات
  { key: "stock", actions: ["view"] }, // أرصدة المخزون وكارت الصنف
  // الصلاحية والدفعات (ميزة expiry): view = تقارير الانتهاء ورصيد الدفعات
  // dispose = إتلاف الدفعات المنتهية
  { key: "batches", actions: ["view", "dispose"] },
  // التحويلات المخزنية: إرسال (create) ← استلام (receive) أو إلغاء (cancel)
  // changeDate = تاريخ تحويل سابق (بدونها: تاريخ اليوم)
  {
    key: "transfers",
    actions: ["view", "create", "receive", "cancel", "changeDate"],
  },
  // الجرد: مسودة ← ترحيل (post)
  { key: "inventoryCounts", actions: ["view", "create", "post", "delete"] },
  // التوالف والزيادات: cancel = إلغاء المستند (الحركات بترجع)
  // changeDate = تاريخ سابق (بدونها: تاريخ اليوم)
  {
    key: "stockAdjustments",
    actions: ["view", "create", "update", "cancel", "changeDate"],
  },
  { key: "priceLists", actions: CRUD }, // قوائم الأسعار
  // العروض والخصومات لفترة: activate = تفعيل / إيقاف العرض
  { key: "promotions", actions: [...CRUD, "activate"] },
  // الحسابات: سندات القبض والصرف والتسوية (خصم مسموح به / مكتسب)
  // update = تعديل السند (المسدد على الفواتير بيتوزع من جديد)
  {
    key: "receipts",
    actions: ["view", "create", "update", "delete", "changeDate"],
  },
  {
    key: "paymentVouchers",
    actions: ["view", "create", "update", "delete", "changeDate"],
  },
  {
    key: "settlements",
    actions: ["view", "create", "update", "delete", "changeDate"],
  },
  // سند المقاصة (العميل اللي هو مورد): يقفل رصيده كعميل في رصيده كمورد
  { key: "offsets", actions: ["view", "create", "delete", "changeDate"] },
  { key: "expenseCategories", actions: CRUD }, // بنود المصروفات
  // كشوف الحساب: combined = كشف مشترك للعميل اللي هو مورد (وربطهم)
  { key: "statements", actions: ["customers", "suppliers", "combined"] },
  // التقارير
  { key: "reports", actions: ["sales", "purchases", "vat", "profit", "daily"] },
  // الصفحة الرئيسية: الأرقام المالية (المبيعات والأرباح والشارتات)
  { key: "dashboard", actions: ["finance"] },
  // permissions = تعديل صلاحيات الأدوار
  { key: "roles", actions: [...CRUD, "permissions"] },
  // permissions = صلاحيات المستخدم نفسه (استثناءات على دوره)
  { key: "users", actions: [...CRUD, "permissions"] },
  // الإعدادات: بيانات الشركة (عرض وتعديل فقط)
  { key: "company", actions: ["view", "update"] },
  // الإعدادات: العملات (عرض وتعديل) وطرق الدفع
  { key: "currencies", actions: ["view", "update"] },
  { key: "paymentMethods", actions: CRUD },
  // الإعدادات العامة للنظام (وضع ضريبة المشتريات ...)
  { key: "systemSettings", actions: ["view", "update"] },
  // الطباعة: إعدادات ملصقات الباركود والفواتير (عرض وتعديل)
  { key: "printing", actions: ["view", "update"] },
  // طباعة ملصقات الباركود للمنتجات (منفصلة عن تعديل إعدادات الطباعة)
  { key: "barcodes", actions: ["print"] },
  // الربط مع الزكاة (الفوترة الإلكترونية):
  // view = عرض حالة الربط، setup = تسجيل الفروع مع الهيئة والشهادات،
  // send = إرسال / إعادة إرسال الفواتير، export = تنزيل XML و PDF المعتمد
  { key: "zatca", actions: ["view", "setup", "send", "export"] },
  // الإدارة: النسخ الاحتياطي لقاعدة البيانات
  // download = تنزيل النسخة على الجهاز، settings = تغيير مجلد الحفظ على السيرفر
  {
    key: "backups",
    // restore = استرجاع نسخة (ورفع ملف نسخة من الجهاز)
    actions: ["view", "create", "download", "delete", "settings", "restore"],
  },
  // الإدارة: تصفير الحركات (مسح كل الفواتير والمستندات - بداية جديدة)
  { key: "dataReset", actions: ["run"] },
  // الإعدادات: الدخول والأمان
  // view = عرض إعدادات الدخول، update = تعديلها، sessions = الأجهزة المسجّلة،
  // endSessions = إخراج جهاز / كل أجهزة مستخدم، log = سجل الدخول، unlock = فك القفل
  {
    key: "loginSecurity",
    actions: ["view", "update", "sessions", "endSessions", "log", "unlock"],
  },
];

// كل الصلاحيات كقائمة نصوص: ["categories.view", "categories.create", ...]
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) =>
  group.actions.map((action) => `${group.key}.${action}`),
);

// ------------------------------------------------------------
// صلاحيات مالك البرنامج: محدش غيره يشوفها أو ياخدها (حتى مدير النظام)
// ومش بتظهر في شاشة الأدوار. بتشتغل بس لما حساب المالك يكون متعرّف
// في ملف الإعدادات (ownerMode)، وإلا بتبقى صلاحيات عادية زي الأول
// ------------------------------------------------------------
const OWNER_GROUPS = [
  "company", // بيانات الشركة
  "systemSettings", // الإعدادات العامة
  "paymentMethods", // طرق الدفع
  "currencies", // العملات
  "dataReset", // تصفير البيانات
];
const OWNER_EXTRA = [
  "zatca.setup", // الربط مع الزكاة (التسجيل والشهادات والإعدادات)
  // النسخ الاحتياطي: المجلد والتلقائي والاسترجاع والحذف للمالك
  // (عرض + نسخة الآن + تنزيل: للعميل من الإدارة بالصلاحيات)
  "backups.settings",
  "backups.delete",
  "backups.restore",
  // الدخول والأمان كله، ما عدا فك القفل (للمدير)
  "loginSecurity.view",
  "loginSecurity.update",
  "loginSecurity.sessions",
  "loginSecurity.endSessions",
  "loginSecurity.log",
];
export const OWNER_PERMISSIONS = new Set([
  ...ALL_PERMISSIONS.filter((p) => OWNER_GROUPS.includes(p.split(".")[0])),
  ...OWNER_EXTRA,
]);
export const isOwnerPermission = (permission) =>
  OWNER_PERMISSIONS.has(permission);

// الصلاحيات اللي تتدي للأدوار (شاشة الأدوار): من غير صلاحيات المالك
// hidden: صلاحيات وحدات النشاط المقفولة عند الشركة (user.moduleBlocked)
export function roleGroups(ownerMode, hidden = []) {
  const skip = new Set(hidden ?? []);
  if (!ownerMode && !skip.size) return PERMISSION_GROUPS;
  return PERMISSION_GROUPS.map((g) => ({
    ...g,
    actions: g.actions.filter((a) => {
      const p = `${g.key}.${a}`;
      return !skip.has(p) && !(ownerMode && OWNER_PERMISSIONS.has(p));
    }),
  })).filter((g) => g.actions.length > 0);
}
export const rolePermissionsCount = (ownerMode, hidden) =>
  roleGroups(ownerMode, hidden).reduce((s, g) => s + g.actions.length, 0);

// هل المستخدم يملك الصلاحية؟
// user: المستخدم الحالي { isSuper, isOwner, ownerMode, permissions: [...] }
// - صلاحيات المالك (لما حساب المالك متعرّف): للمالك بس
// - مدير النظام (isSuper): كل الصلاحيات التانية
export function can(user, permission) {
  if (!user) return false;
  // وحدة النشاط مقفولة: على الكل (حتى مالك البرنامج)
  if (user.moduleBlocked?.includes(permission)) return false;
  // مقفولة حسب باقة الشركة (وضع الشركات): على الكل غير مالك البرنامج
  if (!user.isOwner && user.planBlocked?.includes(permission)) return false;
  if (user.ownerMode && OWNER_PERMISSIONS.has(permission)) {
    return Boolean(user.isOwner);
  }
  if (user.isOwner || user.isSuper) return true;
  return user.permissions?.includes(permission) ?? false;
}

// ------------------------------------------------------------
// صلاحيات المستخدم: الدور قالب + استثناءات للمستخدم
// = صلاحيات الدور + المضافة له - المحذوفة منه
// ------------------------------------------------------------
const asList = (v) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];

export function userPermissions(rolePermissions, granted, revoked) {
  const out = new Set(rolePermissions ?? []);
  for (const p of asList(granted)) out.add(p);
  for (const p of asList(revoked)) out.delete(p);
  return [...out];
}

// الاستثناءات من الصلاحيات المطلوبة (بالمقارنة بالدور)
// assignable: الصلاحيات اللي تتعدّل في الشاشة (الباقي مبيتلمسش)
export function permissionOverrides(rolePermissions, wanted, assignable) {
  const role = new Set(rolePermissions ?? []);
  const want = new Set(wanted ?? []);
  const granted = [];
  const revoked = [];
  for (const p of assignable) {
    if (want.has(p) && !role.has(p)) granted.push(p);
    if (!want.has(p) && role.has(p)) revoked.push(p);
  }
  return { granted, revoked };
}
