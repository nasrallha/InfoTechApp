import { z } from "zod";
import { nameField, idField, idsField } from "./common.schema";

// رمز العملة (ISO): 3 حروف إنجليزية كبيرة مثل SAR
const codeField = z
  .string({ error: "RequiredField" })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "CurrencyCodeInvalid");

// الرمز المختصر: ر.س / SAR / $
const symbolField = z
  .string({ error: "RequiredField" })
  .trim()
  .min(1, "RequiredField")
  .max(10, "TextTooLong");

const currencyFields = {
  code: codeField,
  arName: nameField(50),
  enName: nameField(50),
  arSymbol: symbolField,
  enSymbol: symbolField,
  decimals: z
    .number({ error: "RequiredField" })
    .int("MustBeInteger")
    .min(0, "ValueOutOfRange")
    .max(3, "ValueOutOfRange"),
  isActive: z.boolean().default(true),
};

export const createCurrencySchema = z.object(currencyFields);
export const updateCurrencySchema = z.object({ ...currencyFields, id: idField });
export const deleteCurrenciesSchema = idsField;
export const setBaseCurrencySchema = idField;
