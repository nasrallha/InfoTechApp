import "server-only";
import { getActivePaymentMethods } from "@/services/payment-method.service";
import { isDay, today } from "@/lib/dates";

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

// فترة قوايم الفواتير (?from=YYYY-MM-DD&to=YYYY-MM-DD)
// - من غير فترة ولا بحث ← فواتير النهارده بس (مش كل الفواتير)
// - من غير فترة ومعاه بحث (رقم / اسم) ← البحث في كل التواريخ
// ← { from, to, explicit } (explicit: الفترة متحددة في الرابط)
export const parseListRange = ({ from, to, q }) => {
  const f = isDay(from) ? from : null;
  const t = isDay(to) ? to : null;
  if (f || t) return { from: f, to: t, explicit: true };
  if (String(q ?? "").trim()) return { from: null, to: null, explicit: false };
  const d = today();
  return { from: d, to: d, explicit: false };
};

// ?id ← رقم صحيح موجب أو null
export const parseId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 2_147_483_647 ? n : null;
};
