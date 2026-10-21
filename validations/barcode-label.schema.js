import { z } from "zod";
import { nameField, idField, idsField } from "./common.schema";

// أنواع الباركود وأحجامه المسموحة (نستخدمها في الواجهة أيضاً)
export const BARCODE_FORMATS = ["CODE128", "EAN13"];
export const BARCODE_SIZES = ["small", "normal", "large"];

// رقم صحيح بين حدين (المقاسات وأحجام الخط)
const intBetween = (min, max) =>
  z
    .number({ error: "RequiredField" })
    .int("MustBeInteger")
    .min(min, "ValueOutOfRange")
    .max(max, "ValueOutOfRange");

const labelFields = {
  arName: nameField(100),
  enName: nameField(100),

  // مقاس الملصق بالمللي
  width: intBetween(15, 200),
  height: intBetween(10, 200),

  barcodeFormat: z.enum(BARCODE_FORMATS, "ValidationError"),
  barcodeSize: z.enum(BARCODE_SIZES, "ValidationError"),

  showName: z.boolean().default(true),
  showPrice: z.boolean().default(true),
  priceWithTax: z.boolean().default(true),
  showCode: z.boolean().default(true),
  showCompany: z.boolean().default(false),

  nameFontSize: intBetween(4, 40),
  priceFontSize: intBetween(4, 48),

  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
};

export const createLabelSchema = z.object(labelFields);
export const updateLabelSchema = z.object({ ...labelFields, id: idField });
export const deleteLabelsSchema = idsField;
export const setDefaultLabelSchema = idField;
