import "server-only";
import { hasFlag } from "./tenant-state";
import { refresh as refreshPage } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { AppError } from "./errors";
import { dbErrorKind, DB_ALERT } from "./db-errors";
import { getCurrentUser } from "./auth";
import { can } from "./permissions";

// كل الـ actions ترجع نفس الشكل حتى تتعامل معها الواجهة بطريقة واحدة:
//   نجاح: { success: true,  data }
//   فشل:  { success: false, error: "مفتاح ترجمة", fieldErrors? }
//
// schema: قواعد Zod للتحقق من المدخلات
// input:  البيانات القادمة من الواجهة (غير موثوقة)
// handler(data, user): الدالة التي تنفذ العملية بعد نجاح التحقق
//   user = المستخدم الحالي (لمعرفة فرعه وصلاحياته داخل الـ service)
// options:
//   permission: الصلاحية المطلوبة، مثال "products.create" (الحماية الحقيقية هنا وليس في الواجهة)
//   public: true = لا يحتاج تسجيل دخول (صفحة الدخول فقط)
//   refresh: بعد النجاح نحدّث الصفحة الحالية ببيانات جديدة
export async function runAction(schema, input, handler, options = {}) {
  try {
    // استرجاع نسخة احتياطية شغال دلوقتي: مفيش حفظ لحد ما يخلص
    if (await hasFlag("restoring")) {
      return { success: false, error: "RestoreInProgress" };
    }

    // 1) من أنت؟ وهل مسموح لك؟
    let user = null;
    if (!options.public) {
      user = await getCurrentUser();
      if (!user) return { success: false, error: "SessionExpired" };

      if (options.permission && !can(user, options.permission)) {
        return { success: false, error: "Forbidden" };
      }
    }

    // 2) التحقق من البيانات
    let data = input;

    if (schema) {
      const parsed = schema.safeParse(input);

      if (!parsed.success) {
        // نرجع أول رسالة خطأ لكل حقل: { arName: "MinCharcters", ... }
        const fieldErrors = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path.join(".") || "_";
          if (!fieldErrors[field]) fieldErrors[field] = issue.message;
        }
        return { success: false, error: "ValidationError", fieldErrors };
      }

      data = parsed.data;
    }

    // 3) التنفيذ
    const result = await handler(data, user);

    if (options.refresh) refreshPage();

    return { success: true, data: result ?? null };
  } catch (error) {
    // أخطاء Next.js الداخلية (مثل redirect) لازم تكمل طريقها ولا نمسكها
    unstable_rethrow(error);

    // خطأ متوقع من الـ service: نرجعه للمستخدم كما هو
    if (error instanceof AppError) {
      return {
        success: false,
        error: error.code,
        details: error.details,
        fieldErrors: error.fieldErrors ?? undefined,
      };
    }

    // قاعدة البيانات لا تعمل: رسالة واضحة بالسبب بدل "خطأ غير متوقع"
    const dbKind = dbErrorKind(error);
    if (dbKind) {
      console.error(`[database] ${dbKind}:`, error?.message ?? error);
      return { success: false, error: DB_ALERT[dbKind] };
    }

    // خطأ غير متوقع: نسجله في الـ terminal ولا نرسل تفاصيله للمتصفح
    // (وقت التطوير بس: السبب بيظهر في الرسالة عشان نعرف المشكلة على طول)
    console.error(error);
    if (process.env.NODE_ENV !== "production")
      return {
        success: false,
        error: "UnexpectedErrorDev",
        details: {
          message: String(error?.message ?? error)
            .split("\n")
            .filter((l) => l.trim())
            .slice(-3)
            .join(" | ")
            .slice(0, 400)
            // رموز صيغة الترجمة ({ } ') بتبوّظ الرسالة
            .replace(/[{}]/g, "")
            .replace(/'/g, ""),
        },
      };
    return { success: false, error: "UnexpectedError" };
  }
}
