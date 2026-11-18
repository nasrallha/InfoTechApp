"use server";

// المناديب والعمولات (وحدة salesReps)

import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import {
  repRateSchema,
  salesRepsReportSchema,
} from "@/validations/sales-rep.schema";
import { salesRepsReport, setRepRate } from "@/services/sales-rep.service";

export const salesRepsReportAction = async (input) =>
  runAction(salesRepsReportSchema, input, (d, u) => salesRepsReport(d, u), {
    permission: "salesReps.commissions",
  });

// تعديل نسبة المندوب من التقرير: بصلاحية تعديل المستخدمين كمان
export const setRepRateAction = async (input) =>
  runAction(
    repRateSchema,
    input,
    (d, u) => {
      if (!can(u, "users.update")) throw new AppError("Forbidden");
      return setRepRate(d, u);
    },
    { permission: "salesReps.commissions" },
  );
