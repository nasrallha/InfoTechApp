// ============================================================
// بيانات الاتصال بقاعدة البيانات (من DATABASE_URL في ملف .env)
// مثال: mysql://user:password@localhost:3306/dbname
// تُستخدم في اتصال البرنامج (lib/prisma.js) وفي فحص سبب الفشل (lib/db-diagnose.js)
// ============================================================
export function dbConfig() {
  const url = new URL(process.env.DATABASE_URL);

  return {
    // "localhost" على ويندوز قد يتحول لعنوان IPv6 (::1) وMySQL لا يسمع عليه
    // فنستخدم 127.0.0.1 مباشرة
    host: url.hostname === "localhost" ? "127.0.0.1" : url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    // MySQL 8: طريقة كلمة المرور الافتراضية (caching_sha2_password) تحتاج هذا
    // بعد إعادة تشغيل الجهاز أو السيرفر، وإلا يُرفض الاتصال رغم أن البيانات صحيحة
    allowPublicKeyRetrieval: true,
  };
}
