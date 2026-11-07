import { z } from "zod";
import {
  idField,
  imageField,
  moneyField,
  nameField,
  optionalText,
} from "./common.schema";

// ============================================================
// المطعم / المقهى (وحدة restaurant): المنيو والسائقين والإعدادات
// ============================================================
const sortOrderField = z
  .number()
  .int()
  .min(0, "MustBePositive")
  .max(9999, "ValueOutOfRange")
  .default(0);

// الأسماء ممكن تبقى قصيرة (وسط، حار...)، فمن غير حد أدنى للحروف
const shortName = z
  .string({ error: "RequiredField" })
  .trim()
  .min(1, "RequiredField")
  .max(100, "TextTooLong");

// ---------- الأحجام: صغير، وسط، كبير ----------
const sizeFields = {
  arName: shortName,
  enName: shortName,
  sortOrder: sortOrderField,
  isActive: z.boolean().default(true),
};
export const createRestaurantSizeSchema = z.object(sizeFields);
export const updateRestaurantSizeSchema = z.object({ ...sizeFields, id: idField });

// ---------- مجموعات الإضافات ----------
// minSelect: 0 اختياري، 1+ إجباري | maxSelect: 0 بدون حد (ولو فيه حد ميقلّش عن الأدنى)
const groupFields = {
  arName: shortName,
  enName: shortName,
  minSelect: z.number().int().min(0, "MustBePositive").max(50, "ValueOutOfRange").default(0),
  maxSelect: z.number().int().min(0, "MustBePositive").max(50, "ValueOutOfRange").default(0),
  sortOrder: sortOrderField,
  isActive: z.boolean().default(true),
};
const groupRange = (d) => d.maxSelect === 0 || d.maxSelect >= d.minSelect;
const groupRangeIssue = { message: "RestaurantMaxBelowMin", path: ["maxSelect"] };
export const createRestaurantGroupSchema = z
  .object(groupFields)
  .refine(groupRange, groupRangeIssue);
export const updateRestaurantGroupSchema = z
  .object({ ...groupFields, id: idField })
  .refine(groupRange, groupRangeIssue);

// ---------- الإضافة: مقلي، مشوي، كاتشب... (السعر 0 = مجاناً) ----------
const modifierFields = {
  groupId: idField,
  arName: shortName,
  enName: shortName,
  price: moneyField.default(0),
  sortOrder: sortOrderField,
  isActive: z.boolean().default(true),
};
export const createRestaurantModifierSchema = z.object(modifierFields);
export const updateRestaurantModifierSchema = z.object({
  ...modifierFields,
  id: idField,
});

// ---------- أصناف المنيو ----------
export const addRestaurantItemsSchema = z
  .array(idField)
  .min(1, "RequiredField")
  .max(500);

// صنف المنيو من شاشة المطعم (جديد: productId فاضي) - الصنف نفسه + أجزاء المنيو
// code فاضي = تلقائي (الجديد بس) | sizes: الأحجام بأسعارها (فاضية = سعر الصنف)
// channelPrices: سعر خاص في التطبيق (sizeId 0 = الصنف من غير حجم)
export const saveMenuItemSchema = z.object({
  productId: idField.nullish(),
  code: z.string().trim().max(50, "TextTooLong").nullish().transform((v) => v || null),
  arName: nameField(150),
  enName: nameField(150),
  categoryId: idField.nullish(),
  price: moneyField.default(0),
  isActive: z.boolean().default(true),
  image: imageField,
  removeImage: z.boolean().default(false),
  // السعر شامل الضريبة (فاضي = الافتراضي من إعدادات البرنامج)
  priceIncludesTax: z.boolean().nullish(),
  sortOrder: sortOrderField,
  isTobacco: z.boolean().default(false),
  askPieces: z.boolean().default(false),
  sizes: z
    .array(z.object({ sizeId: idField, price: moneyField }))
    .max(30)
    .default([]),
  groupIds: z.array(idField).max(50).default([]),
  channelPrices: z
    .array(
      z.object({
        channelId: idField,
        sizeId: z.number().int().min(0),
        price: moneyField,
      }),
    )
    .max(1000)
    .default([]),
});

// ---------- السائقين ----------
// commissionType: percent نسبة من رسوم التوصيل | amount مبلغ على كل طلب
const driverFields = {
  name: shortName,
  phone: optionalText(30),
  commissionType: z.enum(["percent", "amount"]).default("amount"),
  commissionValue: moneyField.default(0),
  isActive: z.boolean().default(true),
};
const driverRange = (d) =>
  d.commissionType !== "percent" || d.commissionValue <= 100;
const driverRangeIssue = { message: "ValueOutOfRange", path: ["commissionValue"] };
export const createRestaurantDriverSchema = z
  .object(driverFields)
  .refine(driverRange, driverRangeIssue);
export const updateRestaurantDriverSchema = z
  .object({ ...driverFields, id: idField })
  .refine(driverRange, driverRangeIssue);

// ---------- الإعدادات (0 = مقفولة) ----------
// الخدمة والتبغ: نسبة (لحد 100%) أو مبلغ شامل الضريبة
const feeType = z.enum(["percent", "amount"]).default("percent");
const feeValue = moneyField.max(100_000, "ValueOutOfRange").default(0);
const feeRange = (type, value) => type !== "percent" || value <= 100;
export const saveRestaurantSettingsSchema = z
  .object({
    serviceType: feeType,
    servicePercent: feeValue,
    serviceDineInOnly: z.boolean().default(true),
    deliveryFee: moneyField.default(0),
    tobaccoType: feeType,
    tobaccoPercent: feeValue,
    // الكاشير
    defaultOrderType: z.enum(["local", "dinein", "takeaway", "delivery", "app"]).default("takeaway"),
    defaultTableId: idField.nullish(),
  })
  .refine((d) => feeRange(d.serviceType, d.servicePercent), {
    message: "PercentMax",
    path: ["servicePercent"],
  })
  .refine((d) => feeRange(d.tobaccoType, d.tobaccoPercent), {
    message: "PercentMax",
    path: ["tobaccoPercent"],
  });

// ============================================================
// كاشير المطعم
// ============================================================
// سطر الكاشير: السعر بيتحسب في السيرفر (الحجم + الإضافات + التطبيق)
export const posLine = z.object({
  productId: idField,
  sizeId: z.number().int().min(0).default(0),
  modifierIds: z.array(idField).max(50).default([]),
  // الكمية: كسور لحد 3 خانات (كيلو ونص سمك = 1.5)
  qty: z
    .number({ error: "RequiredField" })
    .positive("MustBePositive")
    .max(999, "ValueOutOfRange")
    .refine(
      (v) => Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6,
      "QtyDecimals",
    ),
  notes: optionalText(200),
  // عدد الحبات (الأصناف اللي بتسأل عنه زي السمك)
  pieces: z.number().int().min(1, "MustBePositive").max(99, "ValueOutOfRange").nullish(),
  discountType: z.enum(["amount", "percent"]).default("amount"),
  discountValue: z.number().min(0).max(1_000_000_000).default(0),
});

// بيانات الطلب: النوع والطاولة والتطبيق والسائق والعميل والرسوم
const orderFields = {
  orderId: idField.nullish(),
  // local محلي من غير طاولة | dinein طاولات | takeaway | delivery | app
  orderType: z.enum(["local", "dinein", "takeaway", "delivery", "app"]),
  tableNo: optionalText(20),
  // الطاولة من الطاولات المتسجلة (لو موجودة) + عدد الأفراد
  tableId: idField.nullish(),
  partySize: z.number().int().min(1).max(100).nullish(),
  channelId: idField.nullish(),
  channelOrderNo: optionalText(50),
  driverId: idField.nullish(),
  customerId: idField.nullish(),
  customerName: optionalText(150),
  phone: optionalText(30),
  address: optionalText(500),
  deliveryFee: moneyField.max(100_000, "ValueOutOfRange").default(0),
  // نوع الخدمة وقت الطلب (الحساب نفسه من إعدادات السيرفر)
  serviceType: z.enum(["percent", "amount"]).default("percent"),
  // قيمة الخدمة (نسبة أو مبلغ حسب الإعداد)
  servicePercent: moneyField.max(100_000, "ValueOutOfRange").default(0),
  lines: z.array(posLine).min(1, "NoItems").max(300),
};

// حفظ الطاولة المفتوحة (من غير فاتورة)
export const saveOpenOrderSchema = z.object(orderFields);

const checkoutPayment = z.object({
  paymentMethodId: idField,
  amount: z
    .number({ error: "RequiredField" })
    .positive("MustBePositive")
    .max(1_000_000_000, "ValueOutOfRange"),
  reference: optionalText(100),
});

// الحساب (الفاتورة)
export const restaurantCheckoutSchema = z
  .object({
    ...orderFields,
    payments: z.array(checkoutPayment).max(10).default([]),
    tenderedAmount: z.number().min(0).max(1_000_000_000).optional(),
    discountType: z.enum(["amount", "percent"]).default("amount"),
    discountValue: z.number().min(0).max(1_000_000_000).default(0),
    requestId: z.uuid().nullish(),
  })
  .refine((d) => d.discountType !== "percent" || d.discountValue <= 100, {
    message: "PercentMax",
    path: ["discountValue"],
  });

export const restaurantOrdersQuerySchema = z.object({
  q: z.string().trim().max(50).default(""),
});

// ============================================================
// الطلب الأونلاين
// ============================================================
const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "ValidationError");

export const onlineSettingsSchema = z.object({
  online: z.boolean().default(false),
  open: timeField,
  close: timeField,
  prepMin: z.number().int().min(0, "MustBePositive").max(240, "ValueOutOfRange"),
  slotMin: z.number().int().min(5, "ValueOutOfRange").max(120, "ValueOutOfRange"),
  curbside: z.boolean().default(true),
  note: optionalText(500),
  // حجز الطاولة من الأونلاين + مدة الجلسة (دقايق)
  dineIn: z.boolean().default(true),
  tableMinutes: z.number().int().min(15, "ValueOutOfRange").max(600, "ValueOutOfRange").default(90),
});

const companyCode = z.string().trim().min(1).max(40);

export const publicMenuSchema = z.object({ code: companyCode });

// الجوال: أرقام بس (9 لـ 15)
export const publicOrderSchema = z.object({
  code: companyCode,
  branchId: idField,
  customerName: z
    .string({ error: "RequiredField" })
    .trim()
    .min(2, "RequiredField")
    .max(150, "TextTooLong"),
  phone: z
    .string({ error: "RequiredField" })
    .trim()
    .regex(/^\+?\d{9,15}$/, "PhoneInvalid"),
  pickupAt: z.iso.datetime({ offset: true, error: "ValidationError" }),
  pickupMode: z.enum(["store", "car"]).default("store"),
  carInfo: optionalText(100),
  // في المحل (حجز طاولة) أو سفري (بيتغلف)
  orderMode: z.enum(["dinein", "takeaway"]).default("takeaway"),
  tableId: idField.nullish(),
  partySize: z.number().int().min(1, "MustBePositive").max(100, "ValueOutOfRange").nullish(),
  notes: optionalText(300),
  lines: z.array(posLine).min(1, "NoItems").max(100),
});

// ============================================================
// طابعات المطعم
// ============================================================
// العنوان: IP (192.168.1.50) أو اسم جهاز على الشبكة
const hostField = z
  .string()
  .trim()
  .max(100, "TextTooLong")
  .regex(/^[A-Za-z0-9.-]+$/, "RestaurantPrinterHostInvalid")
  .nullish()
  .transform((v) => v || null);

export const savePrinterSchema = z
  .object({
    id: idField.nullish(),
    branchId: idField,
    name: shortName,
    kind: z.enum(["cashier", "kitchen"]).default("kitchen"),
    connection: z.enum(["network", "windows", "browser"]).default("network"),
    host: hostField,
    port: z.number().int().min(1, "ValueOutOfRange").max(65535, "ValueOutOfRange").default(9100),
    windowsName: optionalText(150),
    paperSize: z.enum(["80mm", "58mm"]).default("80mm"),
    copies: z.number().int().min(1, "ValueOutOfRange").max(5, "ValueOutOfRange").default(1),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
    // الأولوية (الأصغر يطبع الأول) + قص الورق + صوت التنبيه + تذكرة كاملة (الكاشير)
    priority: z.number().int().min(0).max(99).default(0),
    autoCut: z.boolean().default(true),
    beep: z.boolean().default(false),
    fullTicket: z.boolean().default(false),
    categoryIds: z.array(idField).max(200).default([]),
    productIds: z.array(idField).max(500).default([]),
  })
  .refine((d) => d.connection !== "network" || d.host, {
    message: "RequiredField",
    path: ["host"],
  })
  .refine((d) => d.connection !== "windows" || d.windowsName, {
    message: "RequiredField",
    path: ["windowsName"],
  });

// ---------- الطاولات ----------
export const saveTableSchema = z.object({
  id: idField.nullish(),
  branchId: idField,
  name: z.string({ error: "RequiredField" }).trim().min(1, "RequiredField").max(30, "TextTooLong"),
  seats: z.number().int().min(1, "MustBePositive").max(100, "ValueOutOfRange").default(4),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

// الأونلاين: الطاولات الفاضية في ميعاد
export const publicTablesSchema = z.object({
  code: z.string().trim().min(1).max(40),
  branchId: idField,
  at: z.iso.datetime({ offset: true, error: "ValidationError" }),
  partySize: z.number().int().min(1, "MustBePositive").max(100, "ValueOutOfRange"),
});
