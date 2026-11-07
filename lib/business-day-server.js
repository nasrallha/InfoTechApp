import "server-only";
import { cache } from "react";
import { prisma } from "./prisma";
import { cleanHour } from "./business-day";

// ============================================================
// ساعة بداية يوم العمل للشركة الحالية (الإعدادات العامة)
// مرة واحدة لكل طلب (cache)، و0 لو لسه متحفظتش
// ============================================================
export const getDayStartHour = cache(async () => {
  const s = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { dayStartHour: true },
  });
  return cleanHour(s?.dayStartHour);
});
