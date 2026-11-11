// ============================================================
// فئات الضريبة وأسباب الإعفاء حسب الهيئة + بيانات العميل الشركة (B2B)
// (يشتغل في المتصفح والسيرفر)
// S خاضع بالنسبة الأساسية | Z صفري | E معفى | O خارج نطاق الضريبة
// الصنف اللي نسبته > 0 دايماً S، واللي نسبته 0 لازم يتحدد له فئة وسبب
// ============================================================

export const TAX_CATEGORIES = ["S", "Z", "E", "O"];

// أكواد أسباب الإعفاء/الصفري (VATEX) لكل فئة
export const EXEMPTION_CODES = {
  Z: [
    { code: "VATEX-SA-32", ar: "تصدير السلع", en: "Export of goods" },
    { code: "VATEX-SA-33", ar: "تصدير الخدمات", en: "Export of services" },
    {
      code: "VATEX-SA-34-1",
      ar: "النقل الدولي للسلع",
      en: "The international transport of goods",
    },
    {
      code: "VATEX-SA-34-2",
      ar: "النقل الدولي للركاب",
      en: "The international transport of passengers",
    },
    {
      code: "VATEX-SA-34-3",
      ar: "خدمات مرتبطة بنقل الركاب الدولي",
      en: "Services directly connected and incidental to a supply of international passenger transport",
    },
    {
      code: "VATEX-SA-34-4",
      ar: "توريد وسيلة نقل مؤهلة",
      en: "Supply of a qualifying means of transport",
    },
    {
      code: "VATEX-SA-34-5",
      ar: "خدمات متعلقة بنقل السلع أو الركاب",
      en: "Any services relating to goods or passenger transportation",
    },
    {
      code: "VATEX-SA-35",
      ar: "الأدوية والمعدات الطبية",
      en: "Medicines and medical equipment",
    },
    { code: "VATEX-SA-36", ar: "المعادن المؤهلة", en: "Qualifying metals" },
    {
      code: "VATEX-SA-EDU",
      ar: "التعليم الخاص للمواطنين",
      en: "Private education to citizen",
    },
    {
      code: "VATEX-SA-HEA",
      ar: "الرعاية الصحية الخاصة للمواطنين",
      en: "Private healthcare to citizen",
    },
    {
      code: "VATEX-SA-MLTRY",
      ar: "توريد سلع عسكرية مؤهلة",
      en: "Supply of qualified military goods",
    },
  ],
  E: [
    {
      code: "VATEX-SA-29",
      ar: "الخدمات المالية",
      en: "Financial services mentioned in Article 29 of the VAT Regulations",
    },
    {
      code: "VATEX-SA-29-7",
      ar: "التأمين على الحياة",
      en: "Life insurance services mentioned in Article 29 of the VAT Regulations",
    },
    {
      code: "VATEX-SA-30",
      ar: "التوريدات العقارية",
      en: "Real estate transactions mentioned in Article 30 of the VAT Regulations",
    },
  ],
  O: [
    { code: "VATEX-SA-OOS", ar: "خارج نطاق الضريبة", en: "Not subject to VAT" },
  ],
};

export const exemptionInfo = (category, code) =>
  EXEMPTION_CODES[category]?.find((x) => x.code === code) ?? null;

// النص اللي بيتكتب في الفاتورة (عربي | إنجليزي)
export const exemptionText = (category, code, custom) => {
  if (custom && String(custom).trim()) return String(custom).trim();
  const info = exemptionInfo(category, code);
  return info ? `${info.en} | ${info.ar}` : null;
};

// فئة الضريبة النهائية للصنف (المخزّن قديم أو ناقص → نصلحه هنا)
export function productTax({
  taxRate,
  taxCategory,
  taxExemptionCode,
  taxExemptionReason,
}) {
  if (Number(taxRate) > 0) {
    return {
      taxCategory: "S",
      taxExemptionCode: null,
      taxExemptionReason: null,
    };
  }
  const category = ["Z", "E", "O"].includes(taxCategory) ? taxCategory : "O";
  const code = exemptionInfo(category, taxExemptionCode)
    ? taxExemptionCode
    : (EXEMPTION_CODES[category][0]?.code ?? null);
  return {
    taxCategory: category,
    taxExemptionCode: code,
    taxExemptionReason: exemptionText(category, code, taxExemptionReason),
  };
}

// ------------------------------------------------------------
// معرّفات البائع والمشتري في الفاتورة الإلكترونية (schemeID)
// ------------------------------------------------------------
// البائع: لازم يكون له معرّف غير الرقم الضريبي
export const SELLER_ID_SCHEMES = ["CRN", "700", "MOM", "MLS", "SAG", "OTH"];
// المشتري (في الفاتورة الضريبية لو مالوش رقم ضريبي، أو العميل الأجنبي)
export const BUYER_ID_SCHEMES = [
  "CRN",
  "700",
  "NAT",
  "IQA",
  "PAS",
  "GCC",
  "TIN",
  "MOM",
  "MLS",
  "SAG",
  "OTH",
];

// شكل الرقم لكل نوع (الأنواع التانية: حروف/أرقام لحد 30)
const ID_PATTERNS = {
  CRN: /^\d{10}$/, // السجل التجاري
  700: /^7\d{9}$/, // الرقم الموحد
  NAT: /^1\d{9}$/, // الهوية الوطنية
  IQA: /^2\d{9}$/, // الإقامة
  TIN: /^\d{10}$/, // الرقم المميز
};

export function idValid(scheme, value) {
  const v = String(value ?? "").trim();
  if (!v || !scheme) return false;
  const p = ID_PATTERNS[scheme];
  return p ? p.test(v) : /^[A-Za-z0-9-]{1,30}$/.test(v);
}

// ------------------------------------------------------------
// الدول (كود ISO) - العميل اللي دولته مش السعودية = عميل خارج المملكة
// ------------------------------------------------------------
export const COUNTRIES = [
  ["SA", "السعودية", "Saudi Arabia"],
  ["AE", "الإمارات", "United Arab Emirates"],
  ["KW", "الكويت", "Kuwait"],
  ["QA", "قطر", "Qatar"],
  ["BH", "البحرين", "Bahrain"],
  ["OM", "عُمان", "Oman"],
  ["EG", "مصر", "Egypt"],
  ["JO", "الأردن", "Jordan"],
  ["LB", "لبنان", "Lebanon"],
  ["SY", "سوريا", "Syria"],
  ["IQ", "العراق", "Iraq"],
  ["YE", "اليمن", "Yemen"],
  ["PS", "فلسطين", "Palestine"],
  ["SD", "السودان", "Sudan"],
  ["LY", "ليبيا", "Libya"],
  ["TN", "تونس", "Tunisia"],
  ["DZ", "الجزائر", "Algeria"],
  ["MA", "المغرب", "Morocco"],
  ["MR", "موريتانيا", "Mauritania"],
  ["SO", "الصومال", "Somalia"],
  ["DJ", "جيبوتي", "Djibouti"],
  ["TR", "تركيا", "Turkey"],
  ["IR", "إيران", "Iran"],
  ["PK", "باكستان", "Pakistan"],
  ["IN", "الهند", "India"],
  ["BD", "بنغلاديش", "Bangladesh"],
  ["LK", "سريلانكا", "Sri Lanka"],
  ["NP", "نيبال", "Nepal"],
  ["PH", "الفلبين", "Philippines"],
  ["ID", "إندونيسيا", "Indonesia"],
  ["MY", "ماليزيا", "Malaysia"],
  ["CN", "الصين", "China"],
  ["JP", "اليابان", "Japan"],
  ["KR", "كوريا الجنوبية", "South Korea"],
  ["ET", "إثيوبيا", "Ethiopia"],
  ["ER", "إريتريا", "Eritrea"],
  ["KE", "كينيا", "Kenya"],
  ["NG", "نيجيريا", "Nigeria"],
  ["ZA", "جنوب أفريقيا", "South Africa"],
  ["GB", "المملكة المتحدة", "United Kingdom"],
  ["DE", "ألمانيا", "Germany"],
  ["FR", "فرنسا", "France"],
  ["IT", "إيطاليا", "Italy"],
  ["ES", "إسبانيا", "Spain"],
  ["NL", "هولندا", "Netherlands"],
  ["BE", "بلجيكا", "Belgium"],
  ["CH", "سويسرا", "Switzerland"],
  ["SE", "السويد", "Sweden"],
  ["RU", "روسيا", "Russia"],
  ["US", "الولايات المتحدة", "United States"],
  ["CA", "كندا", "Canada"],
  ["BR", "البرازيل", "Brazil"],
  ["AU", "أستراليا", "Australia"],
];
export const COUNTRY_CODES = COUNTRIES.map((c) => c[0]);

export const isForeign = (c) =>
  String(c?.countryCode || "SA").toUpperCase() !== "SA";

const has = (v) => Boolean(v && String(v).trim());

// ------------------------------------------------------------
// العميل الشركة (محلي): له رقم ضريبي أو معرّف (سجل / رقم موحد / هوية ...)
// = فاتورته ضريبية (B2B)، ولازم بياناته تكون كاملة (المعرّف صحيح + العنوان الوطني)
// ------------------------------------------------------------
export const hasBuyerId = (c) =>
  Boolean(
    c?.idScheme && BUYER_ID_SCHEMES.includes(c.idScheme) && has(c.idNumber),
  );

export const isB2BCustomer = (c) =>
  Boolean(c) && !isForeign(c) && (has(c.taxNo) || hasBuyerId(c));

export const VAT_PATTERN = /^3\d{13}3$/;

// الحقول الناقصة (مفاتيح الحقول نفسها)
export function buyerMissing(c) {
  if (!isB2BCustomer(c)) return [];
  const m = [];
  if (has(c.taxNo)) {
    if (!VAT_PATTERN.test(String(c.taxNo).trim())) m.push("taxNo");
  } else if (!idValid(c.idScheme, c.idNumber)) {
    m.push("idNumber");
  }
  if (!has(c.street)) m.push("street");
  if (!/^\d{4}$/.test(c.buildingNo ?? "")) m.push("buildingNo");
  if (!has(c.district)) m.push("district");
  if (!has(c.city)) m.push("city");
  if (!/^\d{5}$/.test(c.postalCode ?? "")) m.push("postalCode");
  return m;
}

// ------------------------------------------------------------
// عميل فاتورة التصدير: لازم يكون برّه المملكة (الدولة مش السعودية)
// ومن غير رقم ضريبي سعودي
// - الضريبية: وله شارع ومدينة (الهيئة BR-KSA-10)
// - المبسطة: العنوان مش مطلوب (القاعدة مش بتتطبق على المبسطة)
// (المعرّف اختياري: لو مكتوب لازم يكون صحيح - رقمه الضريبي في بلده
//  بيتكتب "معرّف آخر" OTH، لأن خانة الرقم الضريبي للسعودي بس BR-KSA-44)
// kind: standard (الافتراضي) | simplified
// ------------------------------------------------------------
export const EXPORT_KINDS = ["standard", "simplified"];

// نوع فاتورة التصدير من بيانات العميل (زي الفواتير العادية):
// له معرّف ← تصدير ضريبي / مالوش ← تصدير مبسط
export const exportKindOf = (c) => (hasBuyerId(c) ? "standard" : "simplified");

export function exportBuyerMissing(c, kind = "standard") {
  if (!c) return ["customerId"];
  const m = [];
  if (!isForeign(c)) m.push("countryCode");
  if (has(c.taxNo)) m.push("taxNo");
  if (kind !== "simplified" && !has(c.street)) m.push("street");
  if (kind !== "simplified" && !has(c.city)) m.push("city");
  if (has(c.idNumber) && !idValid(c.idScheme, c.idNumber)) m.push("idNumber");
  return m;
}

// فاتورة التصدير: الصنف بضريبة صفرية (تصدير سلع)
export const EXPORT_TAX = {
  taxRate: 0,
  taxCategory: "Z",
  taxExemptionCode: "VATEX-SA-32",
  taxExemptionReason: exemptionText("Z", "VATEX-SA-32"),
};
