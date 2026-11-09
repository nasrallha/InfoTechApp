import "server-only";
import { AppError } from "./errors";
import { isPhoneKey, phoneRule } from "./phone";

// ============================================================
// التحقق من أرقام الجوال في أي بيانات (بعد Zod) حسب العملة الأساسية
// - بيدوّر على كل حقل اسمه phone (أو آخره Phone) في البيانات وجواها
// - الفاضي مش بيتشيك (الإجباري ده شغل Zod)
// بيرجع { field: code } أو null - وassertPhones بيرمي AppError
// (runAction بيعملها لكل الشاشات، والصفحات العامة بتعملها جوه الشركة)
// ============================================================
function collect(value, path, out) {
  if (!value || typeof value !== "object") return;
  if (typeof File !== "undefined" && value instanceof File) return;
  if (value instanceof Date) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => collect(v, [...path, i], out));
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (isPhoneKey(k) && typeof v === "string" && v.trim())
      out.push({ path: [...path, k].join("."), value: v.trim() });
    else collect(v, [...path, k], out);
  }
}

export async function phoneErrors(data) {
  const found = [];
  collect(data, [], found);
  if (!found.length) return null;
  const { getBaseCurrency } = await import("@/services/currency.service");
  const rule = phoneRule((await getBaseCurrency())?.code);
  const errors = {};
  for (const f of found) if (!rule.re.test(f.value)) errors[f.path] = rule.error;
  return Object.keys(errors).length ? errors : null;
}

export async function assertPhones(data) {
  const errors = await phoneErrors(data);
  if (errors) throw new AppError(Object.values(errors)[0], null, errors);
}
