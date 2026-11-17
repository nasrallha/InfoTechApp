"use server";

// السنوات المالية (الإدارة): الإقفال والفتح (fiscalYears.close)
// والتواريخ وبداية السنة (fiscalYears.manage - المالك)

import { z } from "zod";
import { runAction } from "@/lib/action";
import { idField } from "@/validations/common.schema";
import {
  fiscalYearOptions,
  setFiscalStartMonth,
  setFiscalYearStatus,
  updateFiscalYear,
} from "@/services/fiscal-year.service";

const dayText = z.string({ error: "RequiredField" }).regex(/^\d{4}-\d{2}-\d{2}$/, "ValidationError");

// السنوات المالية لفلاتر التقارير: { code, startDate, endDate }
export async function fiscalYearOptionsAction() {
  return runAction(null, null, () => fiscalYearOptions());
}

export async function setFiscalYearStatusAction(input) {
  return runAction(
    z.object({ id: idField, status: z.enum(["open", "closed"], "ValidationError") }),
    input,
    (d) => setFiscalYearStatus(d),
    { permission: "fiscalYears.close", refresh: true },
  );
}

export async function updateFiscalYearAction(input) {
  return runAction(
    z.object({ id: idField, startDate: dayText, endDate: dayText }),
    input,
    (d) => updateFiscalYear(d),
    { permission: "fiscalYears.manage", refresh: true },
  );
}

export async function setFiscalStartMonthAction(month) {
  return runAction(
    z.number({ error: "RequiredField" }).int().min(1, "ValidationError").max(12, "ValidationError"),
    month,
    (m) => setFiscalStartMonth(m),
    { permission: "fiscalYears.manage", refresh: true },
  );
}
