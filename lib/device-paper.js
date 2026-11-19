// ============================================================
// مقاس الورق القديم على الجهاز (كوكي print-paper) - قبل إعدادات الطباعة الكاملة لكل جهاز
// بيتقري بس (services/invoice-print.service) للأجهزة اللي اتظبطت بيه قبل كده
// الجديد: إعدادات الجهاز كاملة في جدول device_print_settings (lib/device-key)
// ============================================================
export const DEVICE_PAPER_COOKIE = "print-paper";
export const DEVICE_PAPERS = ["80mm", "58mm", "A4"];

export const isDevicePaper = (v) => DEVICE_PAPERS.includes(v);
