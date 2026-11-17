// ============================================================
// البند الحر في فواتير البيع والشراء (مشترك بين الواجهة والسيرفر)
// - سطر بوصف يكتبه المستخدم (مش صنف متسجل) ومن غير مخزون
// - بيتسجل على صنف خدمة داخلي واحد (FREE-LINE) فيه كل الوحدات، والوصف = اسم السطر
// - مفعّل افتراضياً في الأنشطة اللي مبتعتمدش على الأصناف، والمالك يفعّله / يقفله للشركة
// ============================================================
export const FREE_LINE_CODE = "FREE-LINE";

export const isFreeLine = (lineOrCode) =>
  (typeof lineOrCode === "string" ? lineOrCode : lineOrCode?.code) === FREE_LINE_CODE;

// الأنشطة اللي البند الحر فيها مفعّل افتراضياً (لو المالك ماحددش)
export const FREE_LINE_MODULES = ["restaurant", "laundry", "contracting", "realEstate"];

// setting: إعداد المالك (true / false / null = حسب النشاط) | modules: وحدات الشركة
export const freeLinesOn = (setting, modules = []) =>
  setting == null ? FREE_LINE_MODULES.some((m) => modules.includes(m)) : Boolean(setting);
