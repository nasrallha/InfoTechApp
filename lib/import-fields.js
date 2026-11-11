// ============================================================
// الاستيراد من Excel: الأصناف والعملاء والموردين
// (مشترك بين الواجهة والسيرفر - مفيش فيه حاجة سرية)
// - key: اسم الحقل (والعنوان بيتترجم من Import.f_<key>)
// - type: text | number | bool | date
// - required: إجباري في الإضافة (التحديث: الخانة الفاضية = متتغيرش)
// - gate: الحقل بيظهر بس لو وحدة الشركة / ميزتها مفعّلة ({ module } أو { feature })
// - aliases: أسماء أعمدة تانية بيتعرف عليها تلقائي (شيت العميل الجاهز)
// ============================================================

export const IMPORT_KINDS = [
  "products",
  "customers",
  "suppliers",
  "units",
  "categories",
];
// أقصى عدد صفوف في الملف الواحد
export const IMPORT_MAX_ROWS = 50_000;
// الصفوف في كل طلب للسيرفر: الفحص / الحفظ
export const CHECK_CHUNK = 2000;
export const RUN_CHUNK = 1000;

const ADDRESS = [
  { key: "city", type: "text", aliases: ["المدينه", "city"] },
  { key: "district", type: "text", aliases: ["الحي", "district"] },
  { key: "street", type: "text", aliases: ["الشارع", "street"] },
  { key: "buildingNo", type: "text", aliases: ["رقم المبني", "المبني", "building"] },
  { key: "additionalNo", type: "text", aliases: ["الرقم الاضافي", "additional"] },
  { key: "postalCode", type: "text", aliases: ["الرمز البريدي", "postal", "zip"] },
];

const PARTY_HEAD = [
  // الكود: لتحديث طرف موجود بس (الجديد كوده تلقائي)
  { key: "code", type: "text", aliases: ["كود", "الكود", "رقم", "code", "no"] },
  {
    key: "arName",
    type: "text",
    required: true,
    aliases: ["الاسم", "اسم العميل", "اسم المورد", "name", "الاسم العربي"],
  },
  { key: "enName", type: "text", aliases: ["english name", "الاسم الانجليزي"] },
  {
    key: "phone",
    type: "text",
    aliases: ["الجوال", "الهاتف", "التليفون", "الموبايل", "phone", "mobile", "tel"],
  },
  {
    key: "taxNo",
    type: "text",
    aliases: ["الرقم الضريبي", "رقم ضريبي", "vat", "vat no", "tax no", "trn"],
  },
];

const PARTY_TAIL = [
  ...ADDRESS,
  {
    key: "openingBalance",
    type: "number",
    aliases: ["الرصيد", "الرصيد الافتتاحي", "balance", "opening balance"],
  },
  { key: "isActive", type: "bool", aliases: ["نشط", "active"] },
];

// الوحدة الإضافية n (كرتونة = 12 حبة): الوحدة + المعامل + الباركود + السعر
const extraUnit = (n) => [
  { key: `unit${n}`, type: "text", aliases: [`الوحده ${n}`, `unit ${n}`] },
  { key: `factor${n}`, type: "number", aliases: [`المعامل ${n}`, `factor ${n}`] },
  { key: `barcode${n}`, type: "text", aliases: [`باركود ${n}`, `barcode ${n}`] },
  { key: `price${n}`, type: "number", aliases: [`سعر ${n}`, `price ${n}`] },
];

export const IMPORT_FIELDS = {
  products: [
    // الكود = باركود الوحدة الأساسية (فاضي ← تلقائي)، وموجود ← تحديث الصنف
    {
      key: "code",
      type: "text",
      aliases: [
        "كود",
        "الكود",
        "كود الصنف",
        "رقم الصنف",
        "باركود",
        "الباركود",
        "barcode",
        "sku",
        "item code",
      ],
    },
    {
      key: "arName",
      type: "text",
      required: true,
      aliases: ["الاسم", "اسم الصنف", "الصنف", "اسم المنتج", "name", "item", "item name", "product"],
    },
    { key: "enName", type: "text", aliases: ["english name", "name en", "الاسم الانجليزي"] },
    { key: "category", type: "text", aliases: ["القسم", "المجموعه", "التصنيف", "category", "group"] },
    { key: "unit", type: "text", aliases: ["الوحده", "الوحده الاساسيه", "unit"] },
    { key: "price", type: "number", aliases: ["السعر", "سعر البيع", "price", "sale price"] },
    { key: "cost", type: "number", aliases: ["التكلفه", "سعر الشراء", "cost", "purchase price"] },
    { key: "wholesalePrice", type: "number", aliases: ["سعر الجمله", "wholesale"] },
    { key: "taxRate", type: "number", aliases: ["الضريبه", "نسبه الضريبه", "vat", "tax"] },
    { key: "isPriceIncludeTax", type: "bool", aliases: ["شامل الضريبه", "السعر شامل الضريبه"] },
    {
      key: "startStock",
      type: "number",
      aliases: ["الرصيد", "الرصيد الافتتاحي", "الكميه", "qty", "quantity", "stock", "opening stock"],
    },
    { key: "isService", type: "bool", aliases: ["خدمه", "service"] },
    { key: "isActive", type: "bool", aliases: ["نشط", "active"] },
    ...extraUnit(2),
    ...extraUnit(3),
    // تتبع الصلاحية (ميزة expiry)
    { key: "trackExpiry", type: "bool", gate: { feature: "expiry" }, aliases: ["تتبع الصلاحيه"] },
    {
      key: "expDate",
      type: "date",
      gate: { feature: "expiry" },
      aliases: ["تاريخ الانتهاء", "الانتهاء", "expiry", "exp date", "expiry date"],
    },
    { key: "expiryAlertDays", type: "number", gate: { feature: "expiry" }, aliases: ["ايام التنبيه"] },
    // الأرقام التسلسلية والضمان (وحدة serials)
    { key: "serialCount", type: "number", gate: { module: "serials" }, aliases: ["عدد السيريال"] },
    { key: "warrantyMonths", type: "number", gate: { module: "serials" }, aliases: ["الضمان", "مده الضمان", "warranty"] },
    { key: "followUpDays", type: "number", gate: { module: "followUps" }, aliases: ["المتابعه"] },
    { key: "changeKm", type: "number", gate: { module: "vehicles" }, aliases: ["التغيير كل كم"] },
    { key: "changeMonths", type: "number", gate: { module: "vehicles" }, aliases: ["التغيير كل شهر"] },
    { key: "durationMin", type: "number", gate: { module: "bookings" }, aliases: ["مده الخدمه", "duration"] },
  ],
  customers: [
    ...PARTY_HEAD,
    { key: "countryCode", type: "text", aliases: ["الدوله", "country"] },
    { key: "idScheme", type: "text", aliases: ["نوع المعرف", "id type"] },
    { key: "idNumber", type: "text", aliases: ["رقم المعرف", "السجل التجاري", "id number", "cr"] },
    ...PARTY_TAIL,
  ],
  // الوحدات والأقسام: الموجود بيتعرف بالاسم (العربي أو الإنجليزي)
  units: [
    { key: "arName", type: "text", required: true, aliases: ["الاسم", "اسم الوحده", "الوحده", "name", "unit"] },
    { key: "enName", type: "text", aliases: ["english name", "الاسم الانجليزي"] },
    { key: "allowDecimals", type: "bool", aliases: ["تقبل الكسور", "كسور", "decimals"] },
    { key: "isActive", type: "bool", aliases: ["نشط", "active"] },
  ],
  categories: [
    { key: "arName", type: "text", required: true, aliases: ["الاسم", "اسم القسم", "القسم", "name", "category"] },
    { key: "enName", type: "text", aliases: ["english name", "الاسم الانجليزي"] },
    // القسم الرئيسي (للقسم الفرعي): بالاسم
    { key: "parent", type: "text", aliases: ["القسم الرئيسي", "الرئيسي", "parent", "main category"] },
    { key: "isActive", type: "bool", aliases: ["نشط", "active"] },
  ],
  suppliers: [
    ...PARTY_HEAD,
    { key: "registrationNo", type: "text", aliases: ["السجل التجاري", "السجل", "cr", "registration"] },
    ...PARTY_TAIL,
  ],
};

// الحقول المفعّلة للشركة (gate: دالة بترجع true/false للوحدة أو الميزة)
export const enabledFields = (kind, isOn) =>
  IMPORT_FIELDS[kind].filter((f) => !f.gate || isOn(f.gate));

// اسم العمود بعد التطبيع (للمطابقة التلقائية):
// من غير مسافات ورموز وتشكيل، والهمزات والتاء المربوطة والألف المقصورة موحّدة
export const normHeader = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\s_\-*:().\/\\#]+/g, "");

// ------------------------------------------------------------
// تحويل قيم الخلايا (السيرفر بيحوّل، والواجهة بتبعت القيمة زي ما هي)
// ------------------------------------------------------------
const AR_DIGITS = /[٠-٩۰-۹]/g;
const toLatin = (s) =>
  String(s).replace(AR_DIGITS, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });

export const cellText = (v) => {
  if (v === null || v === undefined) return "";
  return toLatin(String(v)).trim();
};

// رقم: فاضي ← undefined، غلط ← NaN
export const cellNumber = (v) => {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return v;
  const s = toLatin(v).replace(/[,٬\s]/g, "").replace("٫", ".").replace(/%$/, "");
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

const YES = new Set(["نعم", "ايوه", "اه", "صح", "yes", "y", "true", "1", "✓", "x"]);
const NO = new Set(["لا", "no", "n", "false", "0"]);
// نعم/لا: فاضي ← undefined، غلط ← null
export const cellBool = (v) => {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "boolean") return v;
  const s = normHeader(toLatin(v));
  if (YES.has(s)) return true;
  if (NO.has(s)) return false;
  return null;
};

// تاريخ ← YYYY-MM-DD: فاضي ← undefined، غلط ← null
// (الواجهة بتحوّل تواريخ Excel لـ YYYY-MM-DD، والنص: يوم/شهر/سنة أو سنة-شهر-يوم)
export const cellDate = (v) => {
  if (v === null || v === undefined || v === "") return undefined;
  const s = toLatin(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  let y, mo, d;
  if (m) [, y, mo, d] = m;
  else {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (!m) return null;
    [, d, mo, y] = m;
  }
  const day = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== day
    ? null
    : day;
};
