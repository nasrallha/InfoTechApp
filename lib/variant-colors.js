// ============================================================
// ألوان المقاسات (وحدة variants): اللوحة الجاهزة (دواير زي المتاجر)
// الألوان اللي التاجر بيضيفها بنفسه بتتحفظ في variant_colors
// (السيرفر والمتصفح)
// ============================================================
export const PRESET_COLORS = [
  { ar: "أسود", en: "Black", hex: "#111827" },
  { ar: "أبيض", en: "White", hex: "#ffffff" },
  { ar: "رمادي", en: "Gray", hex: "#9ca3af" },
  { ar: "كحلي", en: "Navy", hex: "#1e3a8a" },
  { ar: "أزرق", en: "Blue", hex: "#2563eb" },
  { ar: "سماوي", en: "Sky", hex: "#7dd3fc" },
  { ar: "أحمر", en: "Red", hex: "#dc2626" },
  { ar: "نبيتي", en: "Maroon", hex: "#7f1d1d" },
  { ar: "وردي", en: "Pink", hex: "#f9a8d4" },
  { ar: "بنفسجي", en: "Purple", hex: "#7c3aed" },
  { ar: "أخضر", en: "Green", hex: "#16a34a" },
  { ar: "زيتي", en: "Olive", hex: "#4d5d23" },
  { ar: "أصفر", en: "Yellow", hex: "#facc15" },
  { ar: "برتقالي", en: "Orange", hex: "#f97316" },
  { ar: "بيج", en: "Beige", hex: "#e7d8b9" },
  { ar: "بني", en: "Brown", hex: "#7c4a21" },
  { ar: "ذهبي", en: "Gold", hex: "#d4a017" },
  { ar: "فضي", en: "Silver", hex: "#c0c4cc" },
];

export const isHex = (v) =>
  typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

// توحيد الكتابة العربي: أبيض = ابيض، أصفر = اصفر، بنفسجى = بنفسجي
const norm = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u0652]/g, "");

// اللون الجاهز بالاسم (عربي أو إنجليزي)
export function presetColor(name) {
  const key = norm(name);
  if (!key) return null;
  return (
    PRESET_COLORS.find((c) => norm(c.ar) === key || norm(c.en) === key) ?? null
  );
}

// خلفية الدايرة: لون الدايرة المحفوظ، وإلا من اسم اللون
// اسم فيه كذا لون («أسود وأبيض» / «أسود ابيض اخضر») ← دايرة مقسومة بالألوان
export function colorFill(name, hex) {
  if (isHex(hex)) return hex;
  const one = presetColor(name);
  if (one) return one.hex;
  const parts = String(name ?? "")
    .split(/[\s,،\-/+&]+/)
    .map((x) => presetColor(x) ?? presetColor(x.replace(/^و/, "")))
    .filter(Boolean)
    .map((c) => c.hex);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  const step = 360 / parts.length;
  return `conic-gradient(${parts
    .map((h, i) => `${h} ${i * step}deg ${(i + 1) * step}deg`)
    .join(", ")})`;
}

// لون فاتح ← حدود رمادي حوالين الدايرة عشان تبان (الأبيض والبيج)
export function isLight(hex) {
  // مش لون واحد (مقسومة أو مالهاش لون) ← حدود رمادي
  if (!isHex(hex)) return true;
  const v = parseInt(hex.slice(1), 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 200;
}
