import { z } from "zod";
import { idField } from "./common.schema";
import { isDay } from "@/lib/dates";

// الـ SDK بيرفض الرموز دي في بيانات الـ CSR
const NO_SPECIAL = /^[^!@#$%&*_<>=|]*$/;

const csrText = (max) =>
  z
    .string({ error: "RequiredField" })
    .trim()
    .min(1, "RequiredField")
    .max(max, "TextTooLong")
    .regex(NO_SPECIAL, "ZatcaInvalidChars");

// بيانات وحدة الربط للفرع
export const zatcaUnitSchema = z.object({
  branchId: idField,
  environment: z.enum(["developer", "simulation", "production"]),
  commonName: csrText(100),
  organizationUnitName: csrText(100),
  // ضريبية + مبسطة | ضريبية فقط | مبسطة فقط
  invoiceType: z.enum(["1100", "1000", "0100"]),
  locationAddress: csrText(150),
  industry: csrText(100),
});

export const zatcaBranchSchema = z.object({ branchId: idField });

// الـ OTP من بوابة فاتورة: 6 أرقام
export const zatcaOtpSchema = z.object({
  branchId: idField,
  otp: z
    .string({ error: "RequiredField" })
    .trim()
    .regex(/^\d{6}$/, "ZatcaInvalidOtp"),
});

// إعدادات الإرسال والتنبيهات
export const zatcaSettingsSchema = z.object({
  sendOnSave: z.boolean(),
  autoSend: z.boolean(),
  intervalMinutes: z
    .number({ error: "RequiredField" })
    .int()
    .min(1, "ValueOutOfRange")
    .max(240, "ValueOutOfRange"),
  alertTime: z
    .string({ error: "RequiredField" })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "InvalidTime"),
  alertThreshold: z
    .number({ error: "RequiredField" })
    .int()
    .min(1, "ValueOutOfRange")
    .max(100000, "ValueOutOfRange"),
});

// متابعة الفواتير الإلكترونية
export const zatcaDocsFilterSchema = z.object({
  from: z.string().refine(isDay, "InvalidDate"),
  to: z.string().refine(isDay, "InvalidDate"),
  branchId: idField.nullish(),
  status: z
    .enum(["pending", "reported", "cleared", "rejected", "error"])
    .nullish(),
  kind: z.enum(["simplified", "standard"]).nullish(),
  docType: z.enum(["invoice", "credit", "debit"]).nullish(),
});

export const zatcaSaleSchema = z.object({ saleId: idField });
