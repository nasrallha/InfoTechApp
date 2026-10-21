"use server";

// تصفير البيانات (اختيار اللي يتمسح) - الإدارة، بصلاحية dataReset.run

import { z } from "zod";
import { runAction } from "@/lib/action";
import { RESET_KEYS } from "@/lib/data-reset";
import { getResetCounts, resetData } from "@/services/data-reset.service";

const resetSchema = z.object({
  // لازم يكتب كلمة التأكيد بإيده
  confirm: z.enum(["تصفير", "RESET"]),
  // اللي يتمسح (اللي مربوط بيه بيتضاف تلقائياً في السيرفر)
  keys: z.array(z.enum(RESET_KEYS)).min(1, "ResetNothingSelected"),
  resetNumbers: z.boolean().default(true),
});

export async function getResetCountsAction() {
  return runAction(null, null, () => getResetCounts(), {
    permission: "dataReset.run",
  });
}

export async function resetTransactionsAction(input) {
  return runAction(resetSchema, input, (d, user) => resetData(d, user), {
    permission: "dataReset.run",
    refresh: true,
  });
}
