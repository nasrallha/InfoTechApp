// اتصال واحد بقاعدة البيانات يُستخدم في كل المشروع (من السيرفر فقط)
import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import mariadb from "mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { dbConfig } from "./db-config";
import { AppError } from "./errors";
import {
  currentCompanyCode,
  multiTenant,
  resolveCompany,
  tenantDbConfig,
} from "./tenant";

function createAdapter(cfg, connectionLimit = 10) {
  return new PrismaMariaDb({
    ...cfg,
    connectionLimit,
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

function createClient(cfg = dbConfig(), connectionLimit = 10) {
  return new PrismaClient({
    adapter: createAdapter(cfg, connectionLimit),
  }).$extends({
    name: "plain-decimals",
    query: {
      async $allOperations({ args, query }) {
        return plainNumbers(await query(args));
      },
    },
  });
}

const globalForPrisma = globalThis;

// ============================================================
// وضع قاعدة واحدة (من غير PANEL_DATABASE_URL): اتصال واحد زي الأول
// ============================================================
function legacyClient() {
  // في وضع التطوير Next يعيد تحميل الملفات كثيراً،
  // فنحفظ الاتصال في globalThis حتى لا نفتح اتصالات جديدة كل مرة
  if (!globalForPrisma.prismaPlain)
    globalForPrisma.prismaPlain = createClient();
  return globalForPrisma.prismaPlain;
}

// ============================================================
// وضع الشركات: اتصال لكل شركة (بيتعمل أول مرة الشركة تُستخدم)
// prisma.<model>.<method>(...) بيتحوّل لقاعدة الشركة الحالية
// (من cookie الطلب، أو runWithCompany) من غير أي تعديل في باقي الملفات
// ============================================================
globalForPrisma.tenantClients ??= new Map();
const tenantClients = globalForPrisma.tenantClients;

async function tenantClient() {
  const code = await currentCompanyCode();
  if (!code) throw new AppError("NoCompany");
  let t = await resolveCompany(code);
  if (!t) throw new AppError("CompanyNotFound");
  if (!t.provisioned) throw new AppError("CompanyNotReady");
  // المفتاح فيه اسم القاعدة والمستخدم: لو اتغيّروا في اللوحة يتعمل اتصال جديد
  const key = `${t.code}:${t.dbName}:${t.dbUser}:${t.dbPasswordEnc}`;
  let entry = tenantClients.get(t.code);
  if (!entry || entry.key !== key) {
    entry?.client.$disconnect().catch(() => {});
    const cfg = tenantDbConfig(t);
    entry = { key, client: createClient(cfg, 5), probe: probe(t.code, cfg) };
    tenantClients.set(t.code, entry);
  }
  try {
    await entry.probe;
  } catch (e) {
    // المرة الجاية نجرب من جديد (ممكن يكون اتصلح)
    if (tenantClients.get(t.code) === entry) tenantClients.delete(t.code);
    entry.client.$disconnect().catch(() => {});
    throw e;
  }
  return entry.client;
}

// تجربة اتصال واحد مباشر بقاعدة الشركة قبل استخدام الـ pool:
// الـ pool بيخبي السبب الحقيقي ورا "pool timeout"،
// هنا بيظهر في الكونسول (Access denied / Unknown database / ...)
async function probe(code, cfg) {
  let conn;
  try {
    conn = await mariadb.createConnection({ ...cfg, connectTimeout: 5000 });
  } catch (e) {
    console.error(
      `[tenant] ${code}: الاتصال بقاعدة الشركة فشل (${cfg.user}@${cfg.host}/${cfg.database}):`,
      e?.code ?? "",
      e?.sqlMessage ?? e?.message,
    );
    throw new AppError("TenantDbUnavailable", {
      message: e?.sqlMessage ?? e?.message ?? "Unknown",
    });
  } finally {
    await conn?.end().catch(() => {});
  }
}

// اتصال الشركة فشل بسبب الدخول (باسورد / قاعدة اتغيرت): نسأل اللوحة من جديد
export async function refreshCurrentTenant() {
  const code = await currentCompanyCode();
  if (!code) return;
  tenantClients
    .get(code)
    ?.client.$disconnect()
    .catch(() => {});
  tenantClients.delete(code);
  await resolveCompany(code, { refresh: true });
}

const currentClient = () =>
  multiTenant() ? tenantClient() : Promise.resolve(legacyClient());

// عملية مؤجلة: بتتنفذ لما حد يستناها (await / then)، أو جوه $transaction([...])
// (عشان $transaction([prisma.a.x(), prisma.b.y()]) يفضل شغال زي Prisma بالظبط)
function deferred(run, spec) {
  let promise = null;
  const exec = () => (promise ??= run());
  return {
    __deferred: spec,
    then: (ok, fail) => exec().then(ok, fail),
    catch: (fail) => exec().catch(fail),
    finally: (fn) => exec().finally(fn),
    [Symbol.toStringTag]: "PrismaPromise",
  };
}

// تحويل عنصر مؤجل لعملية Prisma حقيقية على اتصال معيّن
function materialize(client, item) {
  const spec = item?.__deferred;
  if (!spec) return item;
  return spec.model
    ? client[spec.model][spec.method](...spec.args)
    : client[spec.method](...spec.args);
}

const modelProxies = new Map();
function modelProxy(model) {
  if (!modelProxies.has(model)) {
    modelProxies.set(
      model,
      new Proxy(
        {},
        {
          get(_, method) {
            if (typeof method !== "string" || method === "then")
              return undefined;
            return (...args) =>
              deferred(
                async () => (await currentClient())[model][method](...args),
                { model, method, args },
              );
          },
        },
      ),
    );
  }
  return modelProxies.get(model);
}

const tenantPrisma = new Proxy(
  {},
  {
    get(_, prop) {
      if (typeof prop !== "string" || prop === "then") return undefined;
      if (prop === "$transaction") {
        return async (arg, options) => {
          const client = await currentClient();
          if (Array.isArray(arg))
            return client.$transaction(
              arg.map((item) => materialize(client, item)),
              options,
            );
          return client.$transaction(arg, options);
        };
      }
      if (prop === "$disconnect" || prop === "$connect")
        return async () => (await currentClient())[prop]();
      if (prop.startsWith("$")) {
        // $queryRaw / $executeRaw / $queryRawUnsafe ...
        return (...args) =>
          deferred(async () => (await currentClient())[prop](...args), {
            method: prop,
            args,
          });
      }
      return modelProxy(prop);
    },
  },
);

// نفس الاسم في كل البرنامج: import { prisma } from "@/lib/prisma"
export const prisma = multiTenant() ? tenantPrisma : legacyClient();
