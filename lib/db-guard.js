import "server-only";
import { dbErrorKind } from "./db-errors";
import { diagnoseDb } from "./db-diagnose";

// ============================================================
// تشغيل كود يقرأ من قاعدة البيانات في صفحة (Server Component)
// - نجاح: { data }
// - خطأ قاعدة بيانات معروف: { dbError: { kind, details } } لعرض DbErrorScreen
// - أي خطأ آخر (مثل redirect): يكمل طريقه كما هو
// details: التفاصيل التقنية في وضع التطوير فقط
// ============================================================
export async function withDb(fn) {
  try {
    return { data: await fn() };
  } catch (error) {
    let kind = dbErrorKind(error);
    if (!kind) throw error;

    // "لا يوجد اتصال": نعرف السبب الحقيقي (سيرفر متوقف؟ كلمة مرور؟ اسم القاعدة؟)
    let real = null;
    if (kind === "unreachable") {
      real = await diagnoseDb();
      kind = (real && dbErrorKind(real)) || kind;
    }

    const message = [
      real ? `${real.code ?? ""} ${real.message ?? real}` : null,
      error?.message ?? String(error),
    ]
      .filter(Boolean)
      .join("\n\n");
    console.error(`[database] ${kind}:`, message);

    return {
      dbError: {
        kind,
        details:
          process.env.NODE_ENV !== "production" ? message.slice(0, 3000) : null,
      },
    };
  }
}
