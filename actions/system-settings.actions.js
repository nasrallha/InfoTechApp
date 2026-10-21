"use server";

// البوابة بين شاشة الإعدادات العامة والسيرفر

import { runAction } from "@/lib/action";
import { systemSettingsSchema } from "@/validations/system-settings.schema";
import { saveSystemSettings } from "@/services/system-settings.service";

export async function saveSystemSettingsAction(input) {
  return runAction(systemSettingsSchema, input, (d) => saveSystemSettings(d), {
    permission: "systemSettings.update",
    refresh: true,
  });
}
