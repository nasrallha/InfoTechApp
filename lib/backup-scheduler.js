// ============================================================
// عامل النسخ الاحتياطي التلقائي (بيشتغل في الخلفية مع السيرفر)
// - بيبص كل دقيقة: جه ميعاد نسخة؟ (lib/backup-schedule)
// - لو الجهاز كان مقفول وقت الميعاد: أول ما يشتغل بيعمل النسخة اللي فاتت
// - لو النسخة فشلت: بيحاول تاني كل 30 دقيقة (والشاشة بتعرض السبب)
// بيتشغّل من instrumentation.js مرة واحدة
// ============================================================
import { prisma } from "@/lib/prisma";
import { isBackupDue } from "@/lib/backup-schedule";
import { listCompanyCodes, multiTenant, runWithCompany } from "@/lib/tenant";

const g = globalThis;
const TICK_MS = 60_000;
const RETRY_MS = 30 * 60_000;

// شركة واحدة (أو القاعدة الواحدة): جه ميعاد نسختها؟
// كل شركة بمواعيدها هي (من إعدادات النسخ في قاعدتها) وفي فولدرها هي
async function tickOne(key) {
  const retryAt = g.__erpBackupRetry.get(key);
  if (retryAt && Date.now() < retryAt) return;
  const { scheduleSelect, runAutoBackup, isRestoring } =
    await import("@/services/backup.service");
  if (await isRestoring()) return;
  const s = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: scheduleSelect,
  });
  if (!s || !isBackupDue(s)) return;
  const result = await runAutoBackup();
  if (result === "failed") g.__erpBackupRetry.set(key, Date.now() + RETRY_MS);
  else g.__erpBackupRetry.delete(key);
}

async function tick() {
  if (g.__erpBackupTickRunning) return;
  g.__erpBackupTickRunning = true;
  g.__erpBackupRetry ??= new Map();
  try {
    if (!multiTenant()) {
      await tickOne("_");
      return;
    }
    // وضع الشركات: نلف على الشركات واحدة واحدة
    for (const code of await listCompanyCodes()) {
      try {
        await runWithCompany(code, () => tickOne(code));
      } catch (e) {
        console.error(`[backup] scheduler (${code}):`, e?.message ?? e);
      }
    }
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
