"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useModuleSettings } from "@/components/auth/AuthProvider";

// ============================================================
// اسم مقدم الخدمة حسب النشاط (الإعدادات العامة ← staffTitle):
// فني / عاملة / حلاق / معالج
// نصوص الفنيين فيها {one} {many} {manyOf} {aNew} {each} وبتتملى من هنا
// ============================================================
export function useStaffWords() {
  const ts = useTranslations("StaffTitles");
  const { staffTitle = "technician" } = useModuleSettings();
  return useMemo(
    () => ({
      one: ts(`${staffTitle}.one`),
      many: ts(`${staffTitle}.many`),
      manyOf: ts(`${staffTitle}.manyOf`),
      aNew: ts(`${staffTitle}.aNew`),
      each: ts(`${staffTitle}.each`),
    }),
    [ts, staffTitle],
  );
}

// زي useTranslations بس بيحط اسم مقدم الخدمة في النص لوحده
export function useStaffT(namespace = "Technicians") {
  const t = useTranslations(namespace);
  const words = useStaffWords();
  return useCallback(
    (key, values) => t(key, { ...words, ...values }),
    [t, words],
  );
}
