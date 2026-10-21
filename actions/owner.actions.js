"use server";

// الإعدادات ← حساب المالك

import { z } from "zod";
import { runAction } from "@/lib/action";
import { updateOwnerProfile } from "@/services/owner.service";

// الأسماء: من غير " و \ و $ (ملف .env بيفهمهم بطريقة خاصة)
const safeName = z
  .string()
  .trim()
  .min(2, "MinCharcters")
  .max(100)
  .refine((v) => !/["\\$\r\n]/.test(v), "ValidationError");

const ownerSchema = z
  .object({
    currentPassword: z.string().min(1, "RequiredField"),
    username: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]{3,50}$/, "OwnerUsernameInvalid"),
    newPassword: z
      .string()
      .optional()
      .default("")
      .refine((v) => !v || v.length >= 8, "PasswordMin8"),
    confirmPassword: z.string().optional().default(""),
    arName: safeName,
    enName: safeName,
  })
  .refine((d) => (d.newPassword || "") === (d.confirmPassword || ""), {
    path: ["confirmPassword"],
    message: "PasswordsNotMatch",
  });

export async function updateOwnerProfileAction(input) {
  return runAction(
    ownerSchema,
    input,
    (d, user) => updateOwnerProfile(d, user),
    {
      refresh: true,
    },
  );
}
