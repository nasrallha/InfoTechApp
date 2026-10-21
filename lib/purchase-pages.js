import "server-only";
import { getActivePaymentMethods } from "@/services/payment-method.service";

// طرق الدفع في المشتريات:
// - methods: النشطة بدون "الآجل" (هذه تُسجّل كمدفوعات)
// - creditMethod: طريقة "الآجل" (زر يصفّر المدفوعات، والإجمالي كله على المورد)
export async function getPurchasePaymentMethods() {
  const all = await getActivePaymentMethods();
  return {
    methods: all.filter((m) => m.type !== "credit"),
    creditMethod: all.find((m) => m.type === "credit") ?? null,
  };
}

// ?page=3 ← 3 (أي قيمة غير صحيحة = 1)
export const parsePage = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 1;
};

// ?id ← رقم صحيح موجب أو null
export const parseId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 2_147_483_647 ? n : null;
};
