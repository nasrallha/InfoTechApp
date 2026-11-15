// ============================================================
// الثوب التفاعلي: أجزاء الثوب وأشكالها
// - كل اختيار في إعدادات التفاصيل مربوط بشكل على الثوب (part = "النوع:الشكل")
//   مثال: "collar:shirt" رقبة بياقة / "pocket:round" جيب مدور
// - الموديل (حجازي / كويتي ...) = "preset:..." بيحدد شكل الرقبة والجبزور
//   الافتراضي، واختيار الرقبة أو الجبزور صراحةً بيغلبه
// ============================================================

export const THOBE_PARTS = {
  preset: ["hijazi", "kuwaiti", "qatari", "ghazawi"],
  collar: ["band", "band1", "band2", "round", "shirt", "none"],
  placket: ["zipper", "hidden", "buttons", "hiddenButtons"],
  pocket: ["square", "round", "pointed", "flap", "none"],
  cuff: ["plain", "button", "angled", "round"],
  side: ["slit", "snap", "hidden"],
  extra: ["phone", "pen"],
};

// الأجزاء اللي بتقبل أكتر من شكل مع بعض
const MULTI = new Set(["side", "extra"]);

// الموديل ← الرقبة والجبزور الافتراضيين
const PRESETS = {
  hijazi: { collar: "band1", placket: "zipper" },
  kuwaiti: { collar: "band2", placket: "buttons" },
  qatari: { collar: "shirt", placket: "hiddenButtons" },
  ghazawi: { collar: "round", placket: "hidden" },
};

// الثوب من غير أي اختيار
export const BASE_THOBE = {
  collar: "band1",
  placket: "hidden",
  pocket: "square",
  cuff: "plain",
  side: ["slit"],
  extra: [],
  chosen: {},
};

// "collar:shirt" ← ["collar", "shirt"] (أو null لو مش صالح)
export function parsePart(part) {
  const [kind, shape] = String(part ?? "").split(":");
  return THOBE_PARTS[kind]?.includes(shape) ? [kind, shape] : null;
}

// الاختيارات المعلّمة (فيها part) ← شكل الثوب
// chosen: الأجزاء اللي اتحددت صراحةً (بتتلوّن بلون البرنامج)
export function thobeFromChoices(choices = []) {
  const t = {
    ...BASE_THOBE,
    side: [...BASE_THOBE.side],
    extra: [],
    chosen: {},
  };
  const parts = choices.map((c) => parsePart(c.part)).filter(Boolean);
  for (const [kind, shape] of parts) {
    if (kind !== "preset") continue;
    Object.assign(t, PRESETS[shape]);
    t.chosen.collar = t.chosen.placket = "preset";
  }
  let sideSet = false;
  for (const [kind, shape] of parts) {
    if (kind === "preset") continue;
    if (MULTI.has(kind)) {
      if (kind === "side" && !sideSet) {
        t.side = [];
        sideSet = true;
      }
      if (!t[kind].includes(shape)) t[kind].push(shape);
    } else t[kind] = shape;
    t.chosen[kind] = true;
  }
  return t;
}
