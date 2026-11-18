import { dbDateToDay, formatDay } from "./dates";

// ============================================================
// ترتيب الوردية في يوم العمل: "الوردية 2 — 30/10/2026"
// shift.businessDay (عمود @db.Date) + shift.dayNo
// ============================================================
export const shiftDay = (shift) =>
  shift?.businessDay ? dbDateToDay(shift.businessDay) : null;

// للطباعة (عربي / إنجليزي): [نص عربي، نص إنجليزي]
export const shiftDayTexts = (shift) => {
  const day = shiftDay(shift);
  if (!day || !shift?.dayNo) return null;
  return [
    `الوردية ${shift.dayNo} — ${formatDay(day)}`,
    `Shift ${shift.dayNo} — ${formatDay(day)}`,
  ];
};

// اسم وردية الفرع: اسم الفترة (لو متحددة في الإعدادات) أو null
export const branchShiftName = (bs, locale) =>
  bs ? (locale === "ar" ? bs.periodArName : bs.periodEnName || bs.periodArName) || null : null;
