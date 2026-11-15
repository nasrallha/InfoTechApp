// ============================================================
// الخياط (وحدة tailoring): ثوابت مشتركة بين الواجهة والسيرفر
// ============================================================

// صلة القرابة بالعميل
export const KINSHIPS = ["self", "son", "brother", "father", "other"];

// حالات طلب التفصيل
// new جديد | working تحت التفصيل | ready جاهز | delivered مُسلَّم | cancelled ملغي
export const ORDER_STATUSES = ["new", "working", "ready", "delivered", "cancelled"];
// الحالات المفتوحة (لسه ما اتسلمش)
export const OPEN_STATUSES = ["new", "working", "ready"];

// لون حالة الطلب (antd Tag)
export const STATUS_COLOR = {
  new: "blue",
  working: "orange",
  ready: "green",
  delivered: "default",
  cancelled: "red",
};

// صورة شكل التفصيل: الجاهزة في البرنامج (/tailoring/x.png) أو مرفوعة (tailoring/x.webp)
export const styleImageUrl = (path) =>
  path ? (path.startsWith("/") ? path : `/api/uploads/${path}`) : null;
// الصورة الجاهزة مش بتتمسح من القرص (مشتركة لكل الشركات)
export const isBuiltInImage = (path) => Boolean(path?.startsWith("/"));
