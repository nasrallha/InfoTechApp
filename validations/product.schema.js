import { z } from "zod";
import {
  nameField,
  idField,
  idsField,
  moneyField,
  imageField,
  optionalText,
} from "./common.schema";
import { EXEMPTION_CODES, productTax } from "@/lib/zatca-tax";

// باركود اختياري: نص فاضي يصبح null
const optionalBarcode = z
  .string()
  .trim()
  .max(50, "TextTooLong")
  .nullish()
  .transform((v) => (v ? v : null));

// وحدة إضافية للمنتج (علبة، كرتونة ...)
const productUnitSchema = z.object({
  unitId: idField,
  // كم وحدة أساسية داخل هذه الوحدة (كرتونة = 50 قطعة)، لازم أكبر من 1
  conversionFactor: z
    .number({ error: "RequiredField" })
    .gt(1, "ConversionFactorInvalid"),
  barcode: optionalBarcode,
  cost: moneyField.default(0),
  price: moneyField,
  // الرصيد الافتتاحي بهذه الوحدة (10 كرتونة)
  startStock: z
    .number()
    .min(0, "MustBePositive")
    .max(1_000_000, "ValueOutOfRange")
    .refine(
      (v) => Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6,
      "QtyDecimals",
    )
    .default(0),
});

// القواعد المشتركة بين الإضافة والتعديل
const productFields = {
  code: z
    .string({ error: "RequiredField" })
    .trim()
    .min(1, "RequiredField")
    .max(50, "TextTooLong"),
  arName: nameField(150),
  enName: nameField(150),

  // الخدمة: القسم اختياري (افتراضي "خدمات") والوحدة "خدمة" تلقائي
  categoryId: idField.nullish(),
  baseUnitId: idField.nullish(),

  cost: moneyField,
  price: moneyField,
  wholesalePrice: moneyField.default(0),

  taxRate: z
    .number()
    .min(0, "MustBePositive")
    .max(100, "TaxRateInvalid")
    .default(0),
  isPriceIncludeTax: z.boolean().default(false),

  // الفوترة الإلكترونية: فئة الضريبة وسبب الإعفاء (للأصناف بنسبة 0 فقط)
  taxCategory: z.enum(["S", "Z", "E", "O"]).default("S"),
  taxExemptionCode: z.string().trim().max(20).nullish(),
  taxExemptionReason: z.string().trim().max(255, "TextTooLong").nullish(),

  // الرصيد الافتتاحي: كسور لحد 3 خانات (الأصناف الموزونة 1.250 كجم)
  startStock: z
    .number()
    .min(0, "MustBePositive")
    .max(1_000_000, "ValueOutOfRange")
    .refine(
      (v) => Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6,
      "QtyDecimals",
    )
    .default(0),
  isActive: z.boolean().default(true),
  // خدمة بدون مخزون
  isService: z.boolean().default(false),
  // تتبع الصلاحية (ميزة expiry): الرصيد بالدفعات + أيام التنبيه (فاضي = إعداد الشركة)
  trackExpiry: z.boolean().default(false),
  expiryAlertDays: z.number().int().min(1).max(3650).nullish(),

  image: imageField,

  units: z.array(productUnitSchema).default([]),

  // المستودعات (الفروع): الصنف متاح في كلها، ولا في المحددة بس (stores.available)
  // + الرصيد الافتتاحي في كل مستودع بالوحدة المختارة (فاضية = الأساسية)
  allWarehouses: z.boolean().optional(),
  stores: z
    .array(
      z.object({
        warehouseId: idField,
        available: z.boolean().default(false),
        openingQty: z
          .number()
          .min(0, "MustBePositive")
          .max(1_000_000, "ValueOutOfRange")
          .refine(
            (v) => Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6,
            "QtyDecimals",
          )
          .default(0),
        openingUnitId: idField.nullish(),
      }),
    )
    .max(500)
    .optional(),

  // الأرقام التسلسلية والضمان (وحدة serials)
  serialCount: z.number().int().min(0).max(2).default(0),
  serialLabel1: optionalText(40),
  serialLabel2: optionalText(40),
  warrantyMonths: z
    .number()
    .int("ValidationError")
    .min(0, "MustBePositive")
    .max(600, "ValueOutOfRange")
    .default(0),
  warrantyType: z.enum(["agent", "store"]).nullish(),

  // المتابعة الدورية (وحدة followUps): 0 = مالوش، غير كده كل كام يوم (مقترح)
  followUpDays: z
    .number()
    .int("ValidationError")
    .min(0, "MustBePositive")
    .max(3650, "ValueOutOfRange")
    .default(0),

  // التغيير الدوري للسيارات (وحدة vehicles): كل كام كم / كل كام شهر (0 = مالوش)
  changeKm: z
    .number()
    .int("ValidationError")
    .min(0, "MustBePositive")
    .max(1_000_000, "ValueOutOfRange")
    .default(0),
  changeMonths: z
    .number()
    .int("ValidationError")
    .min(0, "MustBePositive")
    .max(120, "ValueOutOfRange")
    .default(0),

  // مدة الخدمة بالدقايق (وحدة bookings): الحجز بيحسب منها ميعاد الانتهاء
  durationMin: z
    .number()
    .int("ValidationError")
    .min(0, "MustBePositive")
    .max(24 * 60, "ValueOutOfRange")
    .default(0),
};

// قواعد على الوحدات كلها مع بعض (لا يمكن كتابتها على حقل واحد)
function checkUnits(product, ctx) {
  // الصنف العادي: القسم والوحدة الأساسية إلزاميين
  if (!product.isService) {
    for (const f of ["categoryId", "baseUnitId"])
      if (!product[f])
        ctx.addIssue({ code: "custom", path: [f], message: "RequiredField" });
  }
  if (product.isService) return; // الخدمة مالهاش وحدات إضافية
  const seenUnits = new Set();
  const seenBarcodes = new Set([product.code]);

  product.units.forEach((unit, index) => {
    // الوحدة الأساسية لا تتكرر كوحدة إضافية
    if (unit.unitId === product.baseUnitId) {
      ctx.addIssue({
        code: "custom",
        path: ["units", index, "unitId"],
        message: "BaseUnitInAdditional",
      });
    }

    // نفس الوحدة لا تتكرر مرتين
    if (seenUnits.has(unit.unitId)) {
      ctx.addIssue({
        code: "custom",
        path: ["units", index, "unitId"],
        message: "DuplicateUnit",
      });
    }
    seenUnits.add(unit.unitId);

    // الباركود لا يتكرر داخل نفس المنتج (ولا يساوي كود المنتج)
    if (unit.barcode) {
      if (seenBarcodes.has(unit.barcode)) {
        ctx.addIssue({
          code: "custom",
          path: ["units", index, "barcode"],
          message: "BarcodeExists",
        });
      }
      seenBarcodes.add(unit.barcode);
    }
  });
}

// الصنف بنسبة 0: لازم فئة (صفري / معفى / خارج النطاق) وسبب إعفاء من قائمة الهيئة
function checkTax(product, ctx) {
  if (Number(product.taxRate) > 0) return;
  if (!["Z", "E", "O"].includes(product.taxCategory)) {
    ctx.addIssue({
      code: "custom",
      path: ["taxCategory"],
      message: "ZeroRateCategoryRequired",
    });
    return;
  }
  const codes = EXEMPTION_CODES[product.taxCategory].map((x) => x.code);
  if (!codes.includes(product.taxExemptionCode)) {
    ctx.addIssue({
      code: "custom",
      path: ["taxExemptionCode"],
      message: "ExemptionCodeRequired",
    });
  }
}

// القيم النهائية للضريبة (النسبة > 0 = S بدون سبب)
// + أسماء الأرقام التسلسلية وجهة الضمان حسب العدد والمدة
const withTax = (p) => ({
  ...p,
  ...productTax(p),
  serialLabel1: p.serialCount >= 1 ? (p.serialLabel1 ?? null) : null,
  serialLabel2: p.serialCount === 2 ? (p.serialLabel2 ?? null) : null,
  warrantyType: p.warrantyMonths > 0 ? (p.warrantyType ?? "store") : null,
});

// بيانات إضافة منتج
// الإضافة: الكود اختياري (فاضي = الرقم اللي بعد أكبر كود رقمي)
export const createProductSchema = z
  .object({
    ...productFields,
    code: z.string().trim().max(50, "TextTooLong").default(""),
  })
  .superRefine(checkUnits)
  .superRefine(checkTax)
  .transform(withTax);

// بيانات تعديل منتج = بيانات الإضافة + رقم المنتج + هل شال الصورة
export const updateProductSchema = z
  .object({
    ...productFields,
    id: idField,
    removeImage: z.boolean().default(false),
  })
  .superRefine(checkUnits)
  .superRefine(checkTax)
  .transform(withTax);

// حذف منتج أو أكثر
export const deleteProductsSchema = idsField;
