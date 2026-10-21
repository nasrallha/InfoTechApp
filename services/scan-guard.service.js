import "server-only";
import { AppError } from "@/lib/errors";

// ============================================================
// حماية أخيرة على السيرفر: باركود اتكتب مكان الكمية أو السعر
// الباركود رقم طويل، فأي كمية أو سعر من 7 أرقام أو أكتر (مليون فأكتر)
// بنعتبره باركود غلط والفاتورة متتحفظش، ورسالة فيها رقم السطر
// (خانات الشاشة بتمنع ده قبل ما يوصل هنا، وده للحالات اللي فلتت)
// ============================================================
export const MAX_LINE_NUMBER = 1_000_000; // 7 أرقام

export function assertNoCodesInNumbers(items) {
  (items ?? []).forEach((it, i) => {
    for (const field of ["qty", "price"]) {
      const v = Number(it[field]);
      if (Number.isFinite(v) && Math.abs(v) >= MAX_LINE_NUMBER) {
        const code = field === "qty" ? "TooLongQty" : "TooLongPrice";
        throw new AppError(
          code,
          { line: i + 1, value: String(Math.trunc(v)) },
          { [`items.${i}.${field}`]: code },
        );
      }
    }
  });
}
