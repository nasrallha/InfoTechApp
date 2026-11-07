import "server-only";
import mariadb from "mariadb";
import { currentDbConfig } from "./db-config";

// ============================================================
// معرفة السبب الحقيقي لفشل الاتصال
// رسالة Prisma تقول فقط "pool timeout" (انتهت المهلة) وتخفي السبب،
// فنجرب اتصالاً مباشراً واحداً ونرجع الخطأ الحقيقي:
//   ECONNREFUSED = السيرفر متوقف / Access denied = كلمة المرور / Unknown database ...
// يرجع null لو الاتصال المباشر نجح
// ============================================================
export async function diagnoseDb() {
  let conn;
  try {
    conn = await mariadb.createConnection({
      ...(await currentDbConfig()),
      connectTimeout: 4000,
    });
    return null;
  } catch (error) {
    return error;
  } finally {
    await conn?.end().catch(() => {});
  }
}
