import "server-only";
import { prisma } from "@/lib/prisma";

// ============================================================
// عملية (transaction) مع إعادة محاولة تلقائية عند الـ deadlock
// - كاشيرين بيبيعوا نفس الأصناف في نفس اللحظة ممكن قاعدة البيانات تلغي
//   عملية واحد فيهم (deadlock / write conflict) عشان تفك التشابك.
// - العملية اتلغت بالكامل (rollback) فإعادتها آمنة: بنعيدها لحد مرتين
//   بعد انتظار صغير عشوائي، والمستخدم مش بيحس بحاجة.
// - أي خطأ تاني (رصيد مش كفاية، بيانات غلط ...) بيرجع زي ما هو من غير إعادة.
// ============================================================

const RETRIES = 2;

export function isDeadlock(error) {
  for (let e = error, i = 0; e && i < 5; e = e.cause, i++) {
    if (e.code === "P2034") return true; // Prisma: write conflict / deadlock
    if (e.errno === 1213 || e.code === "ER_LOCK_DEADLOCK") return true; // MySQL
    if (e.originalCode === "1213" || e.originalCode === 1213) return true;
    const adapter = e.meta?.driverAdapterError?.cause;
    if (adapter) {
      if (adapter.kind === "TransactionWriteConflict") return true;
      if (String(adapter.originalCode) === "1213") return true;
    }
    if (/deadlock/i.test(String(e.message ?? ""))) return true;
  }
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runTx(fn, options) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, options);
    } catch (error) {
      if (attempt >= RETRIES || !isDeadlock(error)) throw error;
      console.warn(`[tx] deadlock, retry ${attempt + 1}/${RETRIES}`);
      await sleep(30 + Math.random() * 120 * (attempt + 1));
    }
  }
}
