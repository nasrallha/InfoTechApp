import { z } from "zod";
import { SCALE_FORMATS, SCALE_VALUE_TYPES } from "@/lib/scale-barcode";

// أوضاع الضريبة في الفواتير
// exclusive = غير شامل الضريبة / inclusive = شامل الضريبة / none = بدون ضريبة
export const TAX_MODES = ["exclusive", "inclusive", "none"];

// اسم مقدم الخدمة: فني / عاملة / حلاق / معالج
export const STAFF_TITLES = ["technician", "staff", "barber", "therapist"];

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
    // إلزام الرقم التسلسلي عند البيع (يظهر لو وحدة serials مفعّلة بس)
    serialRequired: z.boolean().optional(),
    // نفس الصنف يتكرر في أكتر من سطر في الفاتورة (كل سطر بوصفه)
    allowDuplicateLines: z.boolean().default(false),
    // اسم مقدم الخدمة حسب النشاط (بيظهر لو وحدة الفنيين مفعّلة بس)
    staffTitle: z.enum(STAFF_TITLES, "ValidationError").optional(),
    // الحجوزات (بتظهر لو وحدة bookings مفعّلة بس)
    bookingOnline: z.boolean().optional(),
    bookingOpen: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "InvalidTime")
      .optional(),
    bookingClose: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "InvalidTime")
      .optional(),
    bookingSlotMin: z.number().int().min(5).max(240).optional(),
    bookingDaysAhead: z.number().int().min(1).max(365).optional(),
    bookingHome: z.boolean().optional(),
    bookingNote: z
      .string()
      .trim()
      .max(500, "TextTooLong")
      .nullish()
      .transform((v) => v || null),
    purchaseTaxMode: z.enum(TAX_MODES, "ValidationError"),
    // بداية يوم العمل: ساعة من 0 (منتصف الليل) لـ 12 الظهر
    dayStartHour: z
      .number()
      .int()
      .min(0, "ValueOutOfRange")
      .max(12, "ValueOutOfRange")
      .default(0),

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
