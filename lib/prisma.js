// اتصال واحد بقاعدة البيانات يُستخدم في كل المشروع (من السيرفر فقط)
import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { dbConfig } from "./db-config";

function createAdapter() {
  return new PrismaMariaDb({
    ...dbConfig(),
    connectionLimit: 10,
    // لو السيرفر متوقف: نعرف بسرعة بدل الانتظار الطويل
    connectTimeout: 5000,
    acquireTimeout: 8000,
  });
}

// ============================================================
// الأرقام العشرية (Decimal) ← أرقام عادية في كل نتائج قاعدة البيانات
//
// أعمدة الأسعار والكميات من نوع Decimal، وPrisma يرجّعها ككائن Decimal.
// الكائن ده مينفعش يتبعت للمتصفح، فكان بيطلع الخطأ:
// "Only plain objects can be passed to Client Components ... Decimal objects are not supported"
// مع كل شاشة أو بيانات جديدة.
//
// الحل هنا مرة واحدة للبرنامج كله: أي نتيجة من قاعدة البيانات
// (أي جدول، أي استعلام، جوه أو بره transaction) تتحول فيها كل Decimal لرقم.
// الدقة كافية: أعمدتنا بحد أقصى 18 رقم و4 خانات عشرية.
// ============================================================
const isDecimal = (v) =>
  v !== null &&
  typeof v === "object" &&
  typeof v.toNumber === "function" &&
  "d" in v &&
  "e" in v &&
  "s" in v;

function plainNumbers(value) {
  if (value === null || typeof value !== "object") return value;
  if (isDecimal(value)) return value.toNumber();
  if (Array.isArray(value)) return value.map(plainNumbers);
  // نلمس الكائنات العادية فقط (لا نغيّر Date أو Buffer أو غيرها)
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out = {};
  for (const key of Object.keys(value)) out[key] = plainNumbers(value[key]);
  return out;
}

function createClient() {
  return new PrismaClient({ adapter: createAdapter() }).$extends({
    name: "plain-decimals",
    query: {
      async $allOperations({ args, query }) {
        return plainNumbers(await query(args));
      },
    },
  });
}

const globalForPrisma = globalThis;

// في وضع التطوير Next يعيد تحميل الملفات كثيراً،
// فنحفظ الاتصال في globalThis حتى لا نفتح اتصالات جديدة كل مرة
// (اسم جديد للمفتاح حتى لا يُستخدم الاتصال القديم بدون التحويل)
export const prisma = globalForPrisma.prismaPlain ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaPlain = prisma;
