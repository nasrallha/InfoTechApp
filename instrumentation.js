// ============================================================
// بيشتغل مرة واحدة لما سيرفر البرنامج يقوم
// - تشغيل خدمة الربط مع الزكاة (ZATCA Gateway) في الخلفية لو فيه فرع مربوط
// - نسخ اللغة الافتراضية من الإعدادات لملف بيقراه الـ proxy
// - تشغيل النسخ الاحتياطي التلقائي في الخلفية
// ============================================================
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // خدمة الزكاة: بس لو فيه فرع مربوط (وإلا بتقوم عند الطلب)
  import("./lib/zatca-gateway-boot")
    .then((m) => m.bootGateway())
    .catch((e) =>
      console.error("[zatca-gateway] boot failed:", e?.message ?? e),
    );
  // النسخ الاحتياطي التلقائي (عامل في الخلفية)
  import("./lib/backup-scheduler")
    .then((m) => m.startBackupScheduler())
    .catch((e) =>
      console.error("[backup] scheduler start failed:", e?.message ?? e),
    );
  // وضع الشركات: الإرسال التلقائي للزكاة في الخلفية (بيلف على الشركات)
  if (process.env.PANEL_DATABASE_URL)
    import("./services/zatca-invoice.service")
      .then((m) => m.ensureZatcaWorker())
      .catch((e) =>
        console.error("[zatca] worker start failed:", e?.message ?? e),
      );
  // اللغة الافتراضية: نسخة من الإعدادات للـ proxy
  import("./services/system-settings.service")
    .then((m) => m.syncAppLocale())
    .catch((e) => console.error("[locale] sync failed:", e?.message ?? e));
}
