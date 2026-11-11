// ============================================================
// قراءة باركود GS1-128 / GS1 DataMatrix (باركود الدواء والأغذية)
// المعرّفات المدعومة (AI):
//   01 = رقم الصنف GTIN (14 رقم)   17 = تاريخ الانتهاء YYMMDD
//   11 = تاريخ الإنتاج YYMMDD       10 = رقم الدفعة (طول متغير، لحد فاصل GS)
//   21 = رقم تسلسلي (طول متغير) - بيتقرا ويتجاهل
// الأشكال: (01)06281000000013(17)271231(10)B123
//         أو من الماسح: 01062810000000131727123110B123 (مع/من غير فاصل GS)
// يرجّع { gtin, expDate, mfgDate, batchNo } أو null لو مش GS1
// ============================================================

const GS = "\u001d";
const FIXED = { "01": 14, 17: 6, 11: 6, 15: 6, "02": 14 };
const VARIABLE = new Set(["10", "21"]);

// YYMMDD ← YYYY-MM-DD (اليوم 00 = آخر يوم في الشهر حسب مواصفة GS1)
function gsDate(v) {
  if (!/^\d{6}$/.test(v)) return null;
  const yy = Number(v.slice(0, 2));
  const mm = Number(v.slice(2, 4));
  let dd = Number(v.slice(4, 6));
  if (mm < 1 || mm > 12) return null;
  const year = 2000 + yy;
  if (dd === 0) dd = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function parseGs1(code) {
  let text = String(code ?? "").trim();
  if (!text) return null;
  // بادئة الماسح ]C1 / ]d2 / ]Q3
  text = text.replace(/^\][A-Za-z]\d/, "");
  const out = {};

  if (text.startsWith("(")) {
    // الشكل المقروء: (AI)قيمة
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m;
    while ((m = re.exec(text))) out[m[1]] = m[2].replace(GS, "").trim();
  } else {
    if (!/^(01|02)\d{14}/.test(text)) return null;
    let i = 0;
    while (i < text.length) {
      if (text[i] === GS) {
        i++;
        continue;
      }
      const ai = text.slice(i, i + 2);
      i += 2;
      if (FIXED[ai]) {
        out[ai] = text.slice(i, i + FIXED[ai]);
        i += FIXED[ai];
      } else if (VARIABLE.has(ai)) {
        // لحد الفاصل، ومن غير فاصل: لآخر النص
        const end = text.indexOf(GS, i);
        out[ai] = text.slice(i, end < 0 ? text.length : end);
        i = end < 0 ? text.length : end + 1;
      } else return Object.keys(out).length ? done(out) : null;
    }
  }
  return done(out);
}

function done(out) {
  const gtin = out["01"] ?? out["02"];
  if (!gtin || !/^\d{14}$/.test(gtin)) return null;
  return {
    gtin,
    expDate: out["17"] ? gsDate(out["17"]) : null,
    mfgDate: out["11"] ? gsDate(out["11"]) : null,
    batchNo: out["10"] ? out["10"].slice(0, 50) : null,
  };
}

// أشكال باركود الصنف المحتملة من GTIN-14: نفسه / EAN-13 / UPC-12 / من غير أصفار البداية
export function gtinCandidates(gtin) {
  const set = new Set([gtin, gtin.slice(1), gtin.slice(2)]);
  set.add(gtin.replace(/^0+/, ""));
  return [...set].filter(Boolean);
}

// ------------------------------------------------------------
// بناء باركود GS1-128 (لطباعة ملصق الدفعة)
// gtin: باركود الصنف (8/12/13/14 رقم ← بيتكمّل لـ 14)
// mfgDate / expDate: YYYY-MM-DD (اللي فاضي مش بيدخل) - من غير رقم الدفعة
// يرجّع { data: للطباعة (مع FNC1)، text: المقروء تحت الباركود } أو null
// ------------------------------------------------------------
export function buildGs1({ gtin, mfgDate, expDate }) {
  const digits = String(gtin ?? "").trim();
  if (!/^\d{8,14}$/.test(digits)) return null;
  // GTIN-14 = أصفار + الكود (رقم التحقق بتاع الكود الأصلي بيفضل زي ما هو)
  const g = digits.padStart(14, "0");
  const yymmdd = (d) => (d ? String(d).slice(2, 10).replaceAll("-", "") : "");
  const mfg = yymmdd(mfgDate);
  const exp = yymmdd(expDate);
  const parts = [["01", g]];
  if (mfg.length === 6) parts.push(["11", mfg]);
  if (exp.length === 6) parts.push(["17", exp]);
  return {
    // JsBarcode (ean128: true) بيحط FNC1 في الأول - كل الحقول طولها ثابت (مفيش فواصل)
    data: parts.map(([ai, v]) => `${ai}${v}`).join(""),
    text: parts.map(([ai, v]) => `(${ai})${v}`).join(""),
  };
}
