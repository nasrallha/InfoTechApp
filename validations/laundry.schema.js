import { z } from "zod";
import {
  idField,
  idsField,
  moneyField,
  nameField,
  optionalText,
} from "./common.schema";

// ============================================================
// المغسلة (وحدة laundry): الخدمات والإضافات وأسعار القطع
// ============================================================
const sortOrderField = z
  .number()
  .int()
  .min(0, "MustBePositive")
  .max(9999, "ValueOutOfRange")
  .default(0);

// الخدمة: غسيل، غسيل وكي، كي...
const serviceFields = {
  arName: nameField(100),
  enName: nameField(100),
  sortOrder: sortOrderField,
  isActive: z.boolean().default(true),
};
export const createLaundryServiceSchema = z.object(serviceFields);
export const updateLaundryServiceSchema = z.object({
  ...serviceFields,
  id: idField,
});

// مجموعة الإضافات: multiple = يختار أكتر من واحدة
const groupFields = {
  arName: nameField(100),
  enName: nameField(100),
  multiple: z.boolean().default(false),
  sortOrder: sortOrderField,
  isActive: z.boolean().default(true),
};
export const createLaundryAddonGroupSchema = z.object(groupFields);
export const updateLaundryAddonGroupSchema = z.object({
  ...groupFields,
  id: idField,
});

// الإضافة (من غير سعر): نشا خفيف، مرزام، علّاق...
// الاسم ممكن يبقى قصير، فمن غير حد أدنى للحروف
const shortName = z
  .string({ error: "RequiredField" })
  .trim()
  .min(1, "RequiredField")
  .max(100, "TextTooLong");
const addonFields = {
  groupId: idField,
  arName: shortName,
  enName: shortName,
  sortOrder: sortOrderField,
  isActive: z.boolean().default(true),
};
export const createLaundryAddonSchema = z.object(addonFields);
export const updateLaundryAddonSchema = z.object({
  ...addonFields,
  id: idField,
});

// سعر القطعة في خدمة: المستعجل فاضي = الخدمة مش متاحة مستعجل
const priceRow = z.object({
  serviceId: idField,
  price: moneyField,
  urgentPrice: moneyField.nullish().transform((v) => v ?? null),
});

// صنف واحد: صنف مغسلة ولا لأ + أسعاره (من فورم الصنف)
// prices: الخدمات المتاحة للقطعة بس (الخدمة اللي مش موجودة = مش متاحة)
export const saveLaundryItemSchema = z.object({
  productId: idField,
  laundryItem: z.boolean(),
  sortOrder: sortOrderField,
  prices: z.array(priceRow).max(100).default([]),
});

// جدول الأسعار (تعديل جماعي): القطع اللي اتغيّرت بس
export const saveLaundryPricesSchema = z
  .array(
    z.object({
      productId: idField,
      prices: z.array(priceRow).max(100),
    }),
  )
  .min(1, "RequiredField")
  .max(1000);

// ============================================================
// طلبات المغسلة (الاستلام)
// ============================================================

// الجوال إجباري: عن طريقه بنلاقي العميل وطلباته (ولا يتكرر بين العملاء)
export const laundryPhoneField = z
  .string({ error: "RequiredField" })
  .trim()
  .min(1, "RequiredField")
  .regex(/^\d{9,11}$/, "PhoneInvalid");

const dayField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ValidationError");

// سطر الطلب: السعر بيتحسب في السيرفر من قائمة الأسعار
const orderLine = z.object({
  productId: idField,
  serviceId: idField,
  isUrgent: z.boolean().default(false),
  qty: z
    .number({ error: "RequiredField" })
    .int("ValidationError")
    .min(1, "MustBePositive")
    .max(999, "ValueOutOfRange"),
  addonIds: z.array(idField).max(30).default([]),
  notes: optionalText(255),
  // سعر مختلف عن قائمة الأسعار (بصلاحية تغيير سعر البيع، غير كده بيتجاهل)
  price: moneyField.nullish(),
});

// الطلب (إضافة أو تعديل): العميل بالجوال
// customerId فاضي = عميل جديد بالاسم ده (أو موجود بنفس الجوال)
export const saveLaundryOrderSchema = z.object({
  id: idField.nullish(),
  customerId: idField.nullish(),
  phone: laundryPhoneField,
  customerName: z
    .string()
    .trim()
    .max(255, "TextTooLong")
    .nullish()
    .transform((v) => v || null),
  notes: optionalText(500),
  items: z.array(orderLine).min(1, "LaundryOrderEmpty").max(200),
});

// البحث عن العميل بالجوال (شاشة الاستلام)
export const laundryCustomerLookupSchema = laundryPhoneField;

// لوحة الطلبات
// - q: جوال / رقم الطلب اليومي (مع day) / باركود الإيصال (LO + الرقم الفريد)
// - from / to: فترة (يوم العمل)
// - status: open = كل اللي ما اتسلمش ولا اتلغى
export const LAUNDRY_STATUSES = [
  "received",
  "processing",
  "ready",
  "delivered",
  "cancelled",
];
export const laundryOrderListSchema = z.object({
  q: z.string().trim().max(50).default(""),
  day: dayField.nullish(),
  from: dayField.nullish(),
  to: dayField.nullish(),
  status: z.enum(["open", "all", ...LAUNDRY_STATUSES]).default("open"),
});

// تغيير الحالة (لطلب أو أكتر): مستلَم / قيد التنفيذ / جاهز
// (التسليم مع الفوترة في المرحلة 2-ب)
export const setLaundryOrderStatusSchema = z.object({
  ids: idsField.max(500),
  status: z.enum(["received", "processing", "ready"]),
});

export const cancelLaundryOrderSchema = z.object({
  id: idField,
  reason: optionalText(255),
});

// ملخص اليوم: الطلبات المسجلة والمسلّمة والباقية
export const laundrySummarySchema = dayField.nullish();

// ============================================================
// الفوترة من الكاشير (طلبات المغسلة ← فاتورة بيع)
// ============================================================

// تحميل طلبات في السلة: باركود / رقم يومي + يومه / جوال
export const findLaundryOrdersSchema = z.object({
  q: z.string().trim().min(1, "RequiredField").max(50),
  day: dayField.nullish(),
});

const checkoutPayment = z.object({
  paymentMethodId: idField,
  amount: z
    .number({ error: "RequiredField" })
    .positive("MustBePositive")
    .max(1_000_000_000, "ValueOutOfRange"),
  reference: optionalText(100),
});

// orderIds: الطلبات اللي اتحمّلت في السلة
// newOrder: القطع اللي اتضافت دلوقتي (بتتعمل طلب جديد مع الفاتورة)
export const laundryCheckoutSchema = z
  .object({
    orderIds: z.array(idField).max(100).default([]),
    newOrder: saveLaundryOrderSchema.omit({ id: true }).nullish(),
    payments: z.array(checkoutPayment).max(10).default([]),
    tenderedAmount: z.number().min(0).max(1_000_000_000).optional(),
    discountType: z.enum(["amount", "percent"]).default("amount"),
    discountValue: z.number().min(0).max(1_000_000_000).default(0),
    // الدفع من رصيد الاشتراك (لو للعميل رصيد)
    useWallet: z.boolean().default(false),
    requestId: z.uuid().nullish(),
  })
  .refine((d) => d.orderIds.length || d.newOrder, {
    message: "LaundryOrderEmpty",
    path: ["orderIds"],
  })
  .refine((d) => d.discountType !== "percent" || d.discountValue <= 100, {
    message: "PercentMax",
    path: ["discountValue"],
  });

// التسليم (للطلبات المفوترة)
export const deliverLaundryOrdersSchema = z.object({
  ids: idsField.max(500),
});

// ============================================================
// الاشتراكات (رصيد العميل)
// ============================================================

// اشتراك جديد: العميل بالجوال (أو الـ id)، المدفوع والمشحون (المكافأة = الفرق)
export const createLaundryWalletSchema = z.object({
  customerId: idField.nullish(),
  phone: laundryPhoneField,
  customerName: z
    .string()
    .trim()
    .max(255, "TextTooLong")
    .nullish()
    .transform((v) => v || null),
  paidAmount: z
    .number({ error: "RequiredField" })
    .positive("MustBePositive")
    .max(1_000_000, "ValueOutOfRange"),
  creditAmount: z
    .number({ error: "RequiredField" })
    .positive("MustBePositive")
    .max(10_000_000, "ValueOutOfRange"),
  paymentMethodId: idField,
  reference: optionalText(100),
  notes: optionalText(255),
  requestId: z.uuid().nullish(),
});

// إعدادات الاشتراك: المدة بالشهور (0 = لحد ما الرصيد يخلص) + المكافأة خصم
export const laundryWalletSettingsSchema = z.object({
  months: z.number().int().min(0, "MustBePositive").max(120, "ValueOutOfRange"),
  bonusDiscount: z.boolean(),
});

// مرتجع فاتورة من شاشة الاستلام: نصيب الاشتراك يرجع للرصيد تلقائي،
// والباقي بطريقة الاسترداد (refundMethodId)
export const laundryReturnSchema = z.object({
  saleId: idField,
  items: z
    .array(
      z.object({
        itemId: idField,
        qty: z
          .number({ error: "RequiredField" })
          .positive("MustBePositive")
          .max(1_000_000, "ValueOutOfRange"),
      }),
    )
    .min(1, "NoItems")
    .max(500),
  refundMethodId: idField,
  notes: optionalText(500),
  requestId: z.uuid().nullish(),
});
