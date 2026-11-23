// ============================================================
// طباعة أندرويد (أجهزة الكاشير بطابعة مدمجة / طابعات بلوتوث وشبكة)
// - إعداد على الجهاز نفسه (localStorage): الجهاز اللي متركب عليه تطبيق RawBT بس
// - الإيصال الحراري (80/58mm) بيترسم صورة ← أوامر طباعة ESC/POS (GS v 0)
//   ← بتتبعت لتطبيق RawBT اللي بيطبع على طول من غير نافذة طباعة
// - الطابعة نفسها (المدمجة InnerPrinter / بلوتوث / شبكة) بتتختار من جوه RawBT
// - A4 والأجهزة اللي مش مفعّل عليها: نافذة الطباعة العادية
// ============================================================
import { toCanvas } from "html-to-image";
import { DRAWER_KICK } from "./cash-drawer";

const KEY = "print-android-rawbt";
// نقط الطباعة (203dpi) لكل مقاس: 72mm = 576 | 48mm = 384
const DOTS = { "80mm": 576, "58mm": 384 };
const RAWBT_PACKAGE = "ru.a402d.rawbtprinter";

// مفعّل على الجهاز ده؟ (التخزين ممكن يبقى ممنوع: يرجع false)
export function androidPrintOn() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setAndroidPrint(on) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
    return true;
  } catch {
    return false;
  }
}

// الجهاز أندرويد؟ (الإعداد بيظهر عليه بس)
export const isAndroid = () =>
  typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");

// المقاس ده بيتطبع عن طريق RawBT؟
export const androidPrintable = (paperSize) => paperSize in DOTS && androidPrintOn();

const ESC = 0x1b;
const GS = 0x1d;

// الصورة ← نقط أبيض وأسود بعرض الطابعة ← GS v 0 (شرايح 256 سطر)
function canvasToEscPos(canvas, dots, { openDrawer = false } = {}) {
  const ctx = canvas.getContext("2d");
  const { width: sw, height: sh } = canvas;
  const src = ctx.getImageData(0, 0, sw, sh).data;
  const scale = sw / dots;
  const width = dots;
  const height = Math.max(1, Math.round(sh / scale));
  const bytesPerRow = Math.ceil(width / 8);
  const bits = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(sh - 1, Math.floor(y * scale));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(sw - 1, Math.floor(x * scale));
      const i = (sy * sw + sx) * 4;
      const a = src[i + 3] / 255;
      // الشفاف = أبيض
      const lum = (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]) * a + 255 * (1 - a);
      if (lum < 160) bits[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  // قص المساحة البيضا اللي تحت
  let last = height - 1;
  outer: for (; last > 0; last--) {
    for (let b = 0; b < bytesPerRow; b++) if (bits[last * bytesPerRow + b]) break outer;
  }
  const rows = last + 1;
  const parts = [[ESC, 0x40]]; // تهيئة
  for (let y0 = 0; y0 < rows; y0 += 256) {
    const h = Math.min(256, rows - y0);
    parts.push([GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, h & 0xff, h >> 8]);
    parts.push(bits.subarray(y0 * bytesPerRow, (y0 + h) * bytesPerRow));
  }
  parts.push([ESC, 0x64, 0x04]); // سطور فاضية قبل القص
  parts.push([GS, 0x56, 0x42, 0x00]); // قص (الطابعة اللي من غير قطّاعة بتتجاهله)
  if (openDrawer) parts.push(DRAWER_KICK); // فتح الدرج (حسب إعداد الجهاز)
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function toBase64(bytes) {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

// فتح الدرج بس عن طريق RawBT (زرار «فتح الدرج» في الكاشير)
export function openDrawerViaRawbt() {
  const data = toBase64(new Uint8Array([ESC, 0x40, ...DRAWER_KICK]));
  window.location.href = `intent:base64,${data}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};end;`;
}

// يطبع العنصر ده على RawBT (بيرمي خطأ لو الرسم فشل ← الطباعة العادية)
export async function printViaRawbt(node, paperSize, { openDrawer = false } = {}) {
  const dots = DOTS[paperSize] ?? DOTS["80mm"];
  const width = node.offsetWidth || 1;
  const canvas = await toCanvas(node, {
    backgroundColor: "#ffffff",
    pixelRatio: dots / width,
    cacheBust: false,
  });
  const data = toBase64(canvasToEscPos(canvas, dots, { openDrawer }));
  // RawBT بيستقبل أوامر الطباعة الخام (base64) ويطبعها على الطابعة المختارة فيه
  window.location.href = `intent:base64,${data}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};end;`;
}
