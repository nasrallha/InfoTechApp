// ============================================================
// عامل النسخ الاحتياطي التلقائي (بيشتغل في الخلفية مع السيرفر)
// - بيبص كل دقيقة: جه ميعاد نسخة؟ (lib/backup-schedule)
// - لو الجهاز كان مقفول وقت الميعاد: أول ما يشتغل بيعمل النسخة اللي فاتت
// - لو النسخة فشلت: بيحاول تاني كل 30 دقيقة (والشاشة بتعرض السبب)
// بيتشغّل من instrumentation.js مرة واحدة
// ============================================================
import { prisma } from "@/lib/prisma";
import { isBackupDue } from "@/lib/backup-schedule";

const g = globalThis;
const TICK_MS = 60_000;
const RETRY_MS = 30 * 60_000;

async function tick() {
  if (g.__erpBackupTickRunning || g.__erpRestoring) return;
  if (g.__erpBackupRetryAt && Date.now() < g.__erpBackupRetryAt) return;
  g.__erpBackupTickRunning = true;
  try {
    const { scheduleSelect, runAutoBackup } =
      await import("@/services/backup.service");
    const s = await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: scheduleSelect,
    });
    if (!s || !isBackupDue(s)) return;
    const result = await runAutoBackup();
    g.__erpBackupRetryAt = result === "failed" ? Date.now() + RETRY_MS : null;
  } catch (e) {
    // قاعدة البيانات واقفة مثلاً: نحاول الدقيقة الجاية
    console.error("[backup] scheduler:", e?.message ?? e);
  } finally {
    g.__erpBackupTickRunning = false;
  }
}

export function startBackupScheduler() {
  if (g.__erpBackupScheduler) return;
  g.__erpBackupScheduler = setInterval(tick, TICK_MS);
  // أول فحص بعد ما السيرفر يقوم بشوية
  setTimeout(tick, 20_000);
}
