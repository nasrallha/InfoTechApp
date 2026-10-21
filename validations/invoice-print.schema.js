import { z } from "zod";
import { optionalText } from "./common.schema";

// الاختيارات المسموحة (نستخدمها في الواجهة أيضاً)
export const PAPER_SIZES = ["A4", "80mm", "58mm"];
export const FONT_SIZES = ["small", "normal", "large"];
export const INVOICE_LANGUAGES = ["ar", "en", "both"];
export const LOGO_SIZES = ["small", "medium", "large"];

const margin = z
  .number({ error: "RequiredField" })
  .int("MustBeInteger")
  .min(0, "ValueOutOfRange")
  .max(30, "ValueOutOfRange");

// إعدادات طباعة الفواتير
export const invoicePrintSchema = z.object({
  paperSize: z.enum(PAPER_SIZES, "ValidationError"),

  marginTop: margin,
  marginBottom: margin,
  marginRight: margin,
  marginLeft: margin,

  fontSize: z.enum(FONT_SIZES, "ValidationError"),
  language: z.enum(INVOICE_LANGUAGES, "ValidationError"),

  showLogo: z.boolean(),
  logoSize: z.enum(LOGO_SIZES, "ValidationError"),

  showCashier: z.boolean(),
  showCustomer: z.boolean(),
  showPhone: z.boolean(),
  showEmail: z.boolean(),

  showItemCode: z.boolean(),
  showUnit: z.boolean(),
  showDiscount: z.boolean(),
  showItemTax: z.boolean(),

  showBankAccount: z.boolean(),

  footerTextAr: optionalText(500),
  footerTextEn: optionalText(500),

  autoPrint: z.boolean(),
  copies: z
    .number({ error: "RequiredField" })
    .int("MustBeInteger")
    .min(1, "ValueOutOfRange")
    .max(5, "ValueOutOfRange"),
});
