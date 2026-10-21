// ============================================================
// أخطاء قاعدة البيانات: نحوّل الخطأ التقني لنوع مفهوم + خطوات الحل
// (يُستخدم في السيرفر وفي صفحة الخطأ في المتصفح)
//
// الأنواع:
//   unreachable = سيرفر MySQL متوقف أو العنوان غلط (لا يوجد اتصال)
//   auth        = اسم المستخدم أو كلمة المرور في .env غلط
//   notFound    = اسم قاعدة البيانات غير موجود
//   schema      = جداول/أعمدة ناقصة (لم يتم تشغيل npm run db:deploy)
//   null        = ليس خطأ قاعدة بيانات
// ============================================================

// كل النصوص المرتبطة بالخطأ (الرسالة + سبب الـ driver) في نص واحد للبحث فيه
function errorText(error) {
  if (!error) return "";
  const parts = [
    error.message,
    error.code,
    error.cause?.message,
    error.cause?.code,
  ];
  const driver = error.meta?.driverAdapterError;
  if (driver) {
    parts.push(driver.message, driver.cause?.message, driver.cause?.code);
    try {
      parts.push(JSON.stringify(driver.cause));
    } catch {
      // تجاهل
    }
  }
  return parts.filter(Boolean).join(" ");
}

export function dbErrorKind(error) {
  if (!error) return null;
  const code = error.code;
  const text = typeof error === "string" ? error : errorText(error);

  // جداول أو أعمدة ناقصة: قاعدة البيانات أقدم من الكود
  if (
    ["P2021", "P2022"].includes(code) ||
    /does not exist in the current database|ER_NO_SUCH_TABLE|ER_BAD_FIELD_ERROR|Unknown column/i.test(
      text,
    )
  )
    return "schema";

  // بيانات الدخول لقاعدة البيانات غلط
  if (
    code === "P1000" ||
    /ER_ACCESS_DENIED|Access denied for user|RSA public key|ER_AUTHENTICATION_PLUGIN/i.test(
      text,
    )
  )
    return "auth";

  // اسم القاعدة غير موجود
  if (code === "P1003" || /ER_BAD_DB_ERROR|Unknown database/i.test(text))
    return "notFound";

  // لا يوجد اتصال أصلاً (السيرفر متوقف / العنوان أو المنفذ غلط / مهلة)
  if (
    ["P1001", "P1002", "P1017", "P2024"].includes(code) ||
    /pool timeout|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|Can't reach database|Connection refused|connection closed|socket has unexpectedly been closed/i.test(
      text,
    )
  )
    return "unreachable";

  return null;
}

// مفتاح رسالة قصيرة (قسم Alerts) لكل نوع، للـ actions
export const DB_ALERT = {
  unreachable: "DatabaseUnavailable",
  auth: "DatabaseAuthFailed",
  notFound: "DatabaseNotFound",
  schema: "DatabaseNeedsMigration",
};
