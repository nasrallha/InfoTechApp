import { dayOf } from "./dates";

// ============================================================
// نهاية الضمان: يوم البيع + عدد الشهور ← "YYYY-MM-DD" (null = بدون ضمان)
// لو اليوم مش موجود في الشهر: آخر يوم فيه (31 يناير + شهر = آخر فبراير)
// ============================================================
export function warrantyEndDay(date, months) {
  if (!(months > 0) || !date) return null;
  const [y, m, d] = dayOf(date).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
