import { z } from "zod";
import { idField } from "./common.schema";
import { isDay } from "@/lib/dates";
import { DEVICE_LIMIT_MODES, SECURITY_OPTIONS } from "@/lib/login-security";

// قيمة لازم تكون من الاختيارات المعروضة في الشاشة
const oneOf = (list) =>
  z
    .number({ error: "RequiredField" })
    .int()
    .refine((v) => list.includes(v), "ValidationError");

export const securitySettingsSchema = z.object({
  maxAttempts: oneOf(SECURITY_OPTIONS.maxAttempts),
  attemptWindowMinutes: oneOf(SECURITY_OPTIONS.attemptWindowMinutes),
  lockMinutes: oneOf(SECURITY_OPTIONS.lockMinutes),
  progressiveLock: z.boolean(),
  showRemaining: z.boolean(),
  ipMaxAttempts: oneOf(SECURITY_OPTIONS.ipMaxAttempts),
  idleMinutes: oneOf(SECURITY_OPTIONS.idleMinutes),
  sessionHours: oneOf(SECURITY_OPTIONS.sessionHours),
  logoutOnBrowserClose: z.boolean(),
  maxDevices: oneOf(SECURITY_OPTIONS.maxDevices),
  deviceLimitMode: z.enum(DEVICE_LIMIT_MODES),
  deviceLimitSkipSuper: z.boolean(),
  logRetentionDays: oneOf(SECURITY_OPTIONS.logRetentionDays),
});

const day = z.string().refine(isDay, "InvalidDate");

export const loginLogSchema = z
  .object({
    from: day,
    to: day,
    result: z.enum(["all", "success", "failed"]).default("all"),
    userId: idField.nullish(),
  })
  .refine((d) => d.from <= d.to, { message: "InvalidDate", path: ["to"] });
