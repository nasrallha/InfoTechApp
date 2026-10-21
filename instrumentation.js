// ============================================================
// بيشتغل مرة واحدة لما سيرفر البرنامج يقوم
// - تشغيل خدمة الربط مع الزكاة (ZATCA Gateway) تلقائياً في الخلفية
// - نسخ اللغة الافتراضية من الإعدادات لملف بيقراه الـ proxy
// - تشغيل النسخ الاحتياطي التلقائي في الخلفية
// ============================================================
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureGateway } = await import("./lib/zatca-gateway-launcher");
  ensureGateway({ wait: false });
  // النسخ الاحتياطي التلقائي (عامل في الخلفية)
  import("./lib/backup-scheduler")
    .then((m) => m.startBackupScheduler())
    .catch((e) =>
      console.error("[backup] scheduler start failed:", e?.message ?? e),
    );
  // اللغة الافتراضية: نسخة من الإعدادات للـ proxy
  import("./services/system-settings.service")
    .then((m) => m.syncAppLocale())
    .catch((e) => console.error("[locale] sync failed:", e?.message ?? e));
}
