// ============================================================
// مقاس ورق الطباعة على الجهاز ده (مش إعداد للشركة)
// مثال: جهاز نقطة البيع بطابعة 58mm والباقي 80mm
// - بيتحفظ في كوكي على الجهاز، والسيرفر بيطبّقه وهو بيجيب إعدادات الطباعة
//   (services/invoice-print.service) ← بيتطبق في كل شاشات الطباعة
// - فاضي = مقاس إعدادات الشركة
// ============================================================
export const DEVICE_PAPER_COOKIE = "print-paper";
export const DEVICE_PAPERS = ["80mm", "58mm", "A4"];
const TEN_YEARS = 10 * 365 * 24 * 60 * 60;

export const isDevicePaper = (v) => DEVICE_PAPERS.includes(v);

// المتصفح: المقاس المحفوظ على الجهاز ("" = حسب إعدادات الشركة)
export function readDevicePaper() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp(`(?:^|; )${DEVICE_PAPER_COOKIE}=([^;]*)`));
  const v = m ? decodeURIComponent(m[1]) : "";
  return isDevicePaper(v) ? v : "";
}

export function saveDevicePaper(v) {
  try {
    document.cookie = isDevicePaper(v)
      ? `${DEVICE_PAPER_COOKIE}=${v}; path=/; max-age=${TEN_YEARS}; samesite=lax`
      : `${DEVICE_PAPER_COOKIE}=; path=/; max-age=0; samesite=lax`;
    return true;
  } catch {
    return false;
  }
}
