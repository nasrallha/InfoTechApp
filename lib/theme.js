// ============================================================
// ألوان البرنامج كلها في مكان واحد (المصدر الوحيد)
// - في الـ JSX: import { C } from "@/lib/theme";  ← style={{ color: C.danger }}
// - في ملفات CSS: var(--c-danger)  (المتغيرات بتتولد من نفس القيم هنا
//   وبتتحط في <head> من app/[locale]/layout.jsx)
// - antd (الأزرار، الحقول، القائمة ...) بياخد ألوانه من هنا كمان (AntdProvider)
// لتغيير لون في البرنامج كله: غيّره هنا بس.
// ============================================================

export const C = {
  // الهوية: كحلي بنفسجي #30336b (القائمة الجانبية بنفس الدرجة)
  // والباقي درجات منه: أفتح للأزرار والمختار، وفاتحة جداً للخلفيات
  // النسخ القديمة: تركواز primary #0e9aa0 / فحمي + سماوي #0284c7 / زرقا #2563eb
  // لون البرنامج الأساسي: الأزرار، المختار، الروابط، التركيز، أيقونات + / -
  primary: "#4a4fa8",
  primaryHover: "#3c4090",
  primaryActive: "#30336b",
  primarySoft: "#f1f2fb", // خلفية فاتحة بلون البرنامج
  primaryBorder: "#c9cbee",
  accent: "#e8a33d", // ذهبي دافي للتمييز (متناسق مع الكحلي)

  // الأسطح الغامقة: من نفس اللون
  ink: "#30336b", // القائمة الجانبية (اللون نفسه)
  inkDeep: "#262955", // القوائم الفرعية داخلها (درجة أغمق)
  header: "#3c4090", // شريط عنوان النوافذ (درجة أفتح)
  // رأس الجداول: فاتح بلون البرنامج وكتابة كحلي (مش غامق زي القائمة)
  tableHead: "#e8e9f7",
  tableHeadText: "#30336b",
  tableHeadBorder: "#d3d5ee",
  onDark: "#ffffff",

  // النصوص: رمادي بلمسة كحلي
  text: "#1f2240",
  text2: "#4a4d6b",
  muted: "#6c6f8c",
  subtle: "#a0a3bb",

  // الحدود والخلفيات: فاتحة جداً بلمسة من اللون
  border: "#e4e5f1",
  borderStrong: "#d0d2e6",
  bg: "#f3f4fa", // خلفية الصفحة
  bgSubtle: "#f9f9fd", // خلفية خفيفة جوه الكروت
  surface: "#ffffff",

  // ألوان الحالات (اللون + نسخة للنص بتباين أعلى + خلفية فاتحة)
  success: "#16a34a",
  successText: "#15803d",
  successSoft: "#f0fdf4",
  successBorder: "#bbf7d0",
  danger: "#dc2626",
  dangerText: "#b91c1c",
  dangerSoft: "#fef2f2",
  dangerBorder: "#fecaca",
  warning: "#d97706",
  warningText: "#b45309",
  warningSoft: "#fffbeb",
  warningBorder: "#fde68a",
  // معلومة: سماوي (عشان تتميز عن الكحلي الأساسي)
  info: "#0284c7",
  infoText: "#0369a1",
  infoSoft: "#f0f9ff",
  infoBorder: "#bae6fd",
  // عناوين غامقة (اسم الشركة في الطباعة...)
  navy: "#1e293b",
  purple: "#7c3aed",
  purpleSoft: "#f5f3ff",
  magenta: "#db2777",
  // لون واتساب (أزرار الإرسال للعميل)
  whatsapp: "#25d366",
  whatsappText: "#128c7e",
};

// ألوان الرسوم البيانية بالترتيب (متناسقة مع ألوان البرنامج)
export const CHART_COLORS = [
  C.primary,
  C.info,
  C.warning,
  C.purple,
  C.danger,
  C.accent,
  C.success,
  C.magenta,
  "#a16207",
  C.muted,
];

// primarySoft → --c-primary-soft
const kebab = (k) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

// متغيرات CSS لكل الألوان (بتتحط في :root)
export const themeCssVars = `:root{${Object.entries(C)
  .map(([k, v]) => `--c-${kebab(k)}:${v};`)
  .join("")}}`;
