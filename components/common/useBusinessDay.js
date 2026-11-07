"use client";

import { useModuleSettings } from "@/components/auth/AuthProvider";
import { bizToday, cleanHour } from "@/lib/business-day";

// ساعة بداية يوم العمل (الإعدادات العامة)، 0 = منتصف الليل
export function useDayStartHour() {
  const { dayStartHour = 0 } = useModuleSettings();
  return cleanHour(dayStartHour);
}

// يوم العمل الحالي (YYYY-MM-DD)
export function useBizToday() {
  return bizToday(useDayStartHour());
}
