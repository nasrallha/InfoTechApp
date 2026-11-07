// ============================================================
// واتساب (الطريقة المجانية): المحادثة بتفتح بالرسالة جاهزة
// - الكاشير بيدوس "إرسال" بنفسه (مفيش إرسال تلقائي ولا جماعي)
// - الكمبيوتر: web.whatsapp.com/send في تاب واحدة باسم ثابت
//   (أول مرة بتفتح التاب، وبعدها نفس التاب بتروح على محادثة العميل)
// - الموبايل والتابلت: تطبيق واتساب (api.whatsapp.com/send)
// - الملف (PDF) ما ينفعش يترفق في اللينك: الموبايل ← قائمة المشاركة،
//   الكمبيوتر ← الملف بيتنزل ويتسحب على المحادثة
// ============================================================
import { downloadBlob, safeName } from "./excel";

// كود الدولة الافتراضي (السعودية)
const DEFAULT_CC = "966";
// اسم تاب واتساب ويب (عشان تتفتح مرة واحدة وتتعاد)
const WA_WINDOW = "whatsapp_web";

// الجوال بالصيغة الدولية من غير + ولا أصفار في الأول (واتساب بيطلبها كده)
// 0551234567 ← 966551234567 | 551234567 ← 966551234567 | 00966... ← 966...
export function waNumber(phone, cc = DEFAULT_CC) {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith(cc)) return d;
  if (d.startsWith("0")) d = d.slice(1);
  return `${cc}${d}`;
}

// جهاز لمس (موبايل / تابلت): تطبيق واتساب وقائمة المشاركة
export function isTouchDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    // الآيباد الجديد بيقول عن نفسه Mac
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

// لينك المحادثة بالرسالة
export function waLink(phone, text) {
  const n = waNumber(phone);
  const q = `phone=${n}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
  return isTouchDevice()
    ? `https://api.whatsapp.com/send?${q}`
    : `https://web.whatsapp.com/send?${q}`;
}

// يفتح المحادثة (الكمبيوتر: نفس تاب واتساب ويب كل مرة)
// يرجّع false لو المتصفح منع النافذة (النوافذ المنبثقة مقفولة)
export function openWhatsApp(phone, text) {
  const w = window.open(
    waLink(phone, text),
    isTouchDevice() ? "_blank" : WA_WINDOW,
  );
  if (!w) return false;
  w.focus?.();
  return true;
}

export const pdfFile = (blob, fileName) =>
  new File([blob], `${safeName(fileName)}.pdf`, { type: "application/pdf" });

// الموبايل والتابلت: الجهاز بيقدر يشارك الملف (يختار واتساب من القائمة)
export function canShareFile(file) {
  return isTouchDevice() && Boolean(navigator.canShare?.({ files: [file] }));
}

// إرسال PDF:
// - جهاز لمس: قائمة المشاركة (لازم تتنادى من الضغطة نفسها، فالملف لازم يكون جاهز)
// - الكمبيوتر: المحادثة بتفتح فوراً (من الضغطة) والملف بيتنزل يتسحب عليها
// يرجّع "shared" | "cancelled" | "downloaded"
export async function sendPdf(file, { phone, text }) {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch (e) {
      if (e?.name === "AbortError") return "cancelled";
      // المشاركة اترفضت: نكمّل بالتنزيل
    }
  }
  openWhatsApp(phone, text);
  downloadBlob(file, file.name);
  return "downloaded";
}
