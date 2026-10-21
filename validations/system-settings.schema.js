import { z } from "zod";
import { SCALE_FORMATS, SCALE_VALUE_TYPES } from "@/lib/scale-barcode";

// أوضاع الضريبة في الفواتير
// exclusive = غير شامل الضريبة / inclusive = شامل الضريبة / none = بدون ضريبة
export const TAX_MODES = ["exclusive", "inclusive", "none"];

export const systemSettingsSchema = z
  .object({
    // نسبة الضريبة في البرنامج (0 = غير مسجل في الضريبة)
    taxRate: z
      .number({ error: "RequiredField" })
      .min(0, "ValueOutOfRange")
      .max(100, "ValueOutOfRange"),
    // سعر الصنف الجديد شامل الضريبة؟
    productPriceIncludesTax: z.boolean(),
    // السماح بالبيع/الإخراج بأكثر من الرصيد (الرصيد يصبح سالباً)
    allowNegativeStock: z.boolean(),
    purchaseTaxMode: z.enum(TAX_MODES, "ValidationError"),

    // باركود الميزان (نفس إعدادات برنامج الميزان)
    scaleEnabled: z.boolean().default(false),
    scaleFormat: z.enum(SCALE_FORMATS, "ValidationError").default("1+6+5+1"),
    // العلامة: رقم أو رقمين حسب الشكل (1+... = رقم، 2+... = رقمين)
    scaleFlag: z
      .string()
      .trim()
      .regex(/^\d{1,2}$/, "ScaleFlagInvalid")
      .default("1"),
    scaleValueType: z
      .enum(SCALE_VALUE_TYPES, "ValidationError")
      .default("weight"),
    scaleWeightDecimals: z.number().int().min(0).max(4).default(3),
    scaleMoneyDecimals: z.number().int().min(0).max(4).default(2),

    // اللغة الافتراضية للبرنامج
    defaultLocale: z.enum(["ar", "en"], "ValidationError").default("en"),
    localeDetection: z.boolean().default(true),
  })
  .refine((s) => s.scaleFlag.length === Number(s.scaleFormat.split("+")[0]), {
    path: ["scaleFlag"],
    message: "ScaleFlagLength",
  });
