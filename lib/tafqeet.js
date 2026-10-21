// ============================================================
// التفقيط: كتابة المبلغ بالحروف (عربي / إنجليزي)
//   amountInWords(1250.5, "ar") ← "فقط ألف ومائتان وخمسون ريال سعودي و50 هللة لا غير"
//   amountInWords(1250.5, "en") ← "One thousand two hundred fifty Saudi Riyals and 50 Halalas only"
// ============================================================

const AR_ONES = [
  "",
  "واحد",
  "اثنان",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const AR_TENS = [
  "",
  "",
  "عشرون",
  "ثلاثون",
  "أربعون",
  "خمسون",
  "ستون",
  "سبعون",
  "ثمانون",
  "تسعون",
];
const AR_HUNDREDS = [
  "",
  "مائة",
  "مائتان",
  "ثلاثمائة",
  "أربعمائة",
  "خمسمائة",
  "ستمائة",
  "سبعمائة",
  "ثمانمائة",
  "تسعمائة",
];
// [مفرد، مثنى، جمع (3-10)، تمييز (11+)]
const AR_SCALES = [
  null,
  ["ألف", "ألفان", "آلاف", "ألف"],
  ["مليون", "مليونان", "ملايين", "مليون"],
  ["مليار", "ملياران", "مليارات", "مليار"],
];

function arBelowThousand(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (h) parts.push(AR_HUNDREDS[h]);
  if (rest) {
    if (rest < 20) parts.push(AR_ONES[rest]);
    else {
      const o = rest % 10;
      const t = Math.floor(rest / 10);
      parts.push(o ? `${AR_ONES[o]} و${AR_TENS[t]}` : AR_TENS[t]);
    }
  }
  return parts.join(" و");
}

function arNumber(n) {
  if (n === 0) return "صفر";
  const groups = [];
  let x = n;
  while (x > 0) {
    groups.push(x % 1000);
    x = Math.floor(x / 1000);
  }
  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (!g) continue;
    if (i === 0) {
      parts.push(arBelowThousand(g));
      continue;
    }
    const [one, two, plural, many] = AR_SCALES[i];
    if (g === 1) parts.push(one);
    else if (g === 2) parts.push(two);
    else if (g >= 3 && g <= 10) parts.push(`${arBelowThousand(g)} ${plural}`);
    else parts.push(`${arBelowThousand(g)} ${many}`);
  }
  return parts.join(" و");
}

const EN_ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const EN_TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];
const EN_SCALES = ["", "thousand", "million", "billion"];

function enBelowThousand(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (h) parts.push(`${EN_ONES[h]} hundred`);
  if (rest) {
    if (rest < 20) parts.push(EN_ONES[rest]);
    else {
      const o = rest % 10;
      parts.push(
        o
          ? `${EN_TENS[Math.floor(rest / 10)]}-${EN_ONES[o]}`
          : EN_TENS[rest / 10],
      );
    }
  }
  return parts.join(" ");
}

function enNumber(n) {
  if (n === 0) return "zero";
  const parts = [];
  let i = 0;
  let x = n;
  while (x > 0) {
    const g = x % 1000;
    if (g)
      parts.unshift(
        `${enBelowThousand(g)}${EN_SCALES[i] ? ` ${EN_SCALES[i]}` : ""}`,
      );
    x = Math.floor(x / 1000);
    i++;
  }
  return parts.join(" ");
}

// currency: { arName, enName, arFraction, enFraction, decimals }
export function amountInWords(value, lang = "ar", currency = {}) {
  const decimals = currency.decimals ?? 2;
  const factor = 10 ** decimals;
  const total = Math.round(Math.abs(Number(value) || 0) * factor);
  const whole = Math.floor(total / factor);
  const fraction = total % factor;

  if (lang === "en") {
    const name = currency.enName || "Saudi Riyals";
    const frac = currency.enFraction || "Halalas";
    let s = `${enNumber(whole)} ${name}`;
    if (fraction) s += ` and ${fraction} ${frac}`;
    s = `${s} only`;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const name = currency.arName || "ريال سعودي";
  const frac = currency.arFraction || "هللة";
  let s = `فقط ${arNumber(whole)} ${name}`;
  if (fraction) s += ` و${fraction} ${frac}`;
  return `${s} لا غير`;
}

// اسم العملة وكسورها للتفقيط من العملة الأساسية
const FRACTIONS = {
  SAR: ["هللة", "Halalas"],
  EGP: ["قرش", "Piastres"],
  AED: ["فلس", "Fils"],
  KWD: ["فلس", "Fils"],
  USD: ["سنت", "Cents"],
  EUR: ["سنت", "Cents"],
};
export function wordsCurrency(currency) {
  const [arFraction, enFraction] = FRACTIONS[currency?.code] ?? ["", ""];
  return {
    arName: currency?.arName,
    enName: currency?.enName,
    arFraction,
    enFraction,
    decimals: currency?.decimals ?? 2,
  };
}
