import "server-only";
import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import mariadb from "mariadb";
import { cookies } from "next/headers";
import { decryptPanelSecret } from "./panel-secret";

// ============================================================
// الشركات (أكتر من عميل على نفس البرنامج)
//
// الوضع ده بيشتغل لو PANEL_DATABASE_URL موجود في .env، وإلا البرنامج
// بيفضل على قاعدة واحدة (DATABASE_URL) زي الأول بالظبط.
//
// - العميل بيفتح /c/<الكود> ← الكود بيتحفظ في cookie (erp_company)
// - كل طلب: الكود ← بيانات قاعدة الشركة ← الاتصال بقاعدتها هي بس
// - بيانات القاعدة بنجيبها من لوحة التحكم مرة واحدة لكل شركة،
//   وبتتحفظ في الذاكرة + ملف على السيرفر (.tenants/cache.json)
//   فاللوحة مبتتسألش تاني غير لكود جديد أو لو الاتصال بالقاعدة فشل
// - الاشتراك والحدود: من جدول subscription جوه قاعدة الشركة (lib/subscription.js)
// ============================================================

export const TENANT_COOKIE = "erp_company";
const CODE_RE = /^[A-Z2-9]{8}$/;
const CACHE_DIR = path.join(process.cwd(), ".tenants");
const CACHE_FILE = path.join(CACHE_DIR, "cache.json");
// الكود اللي مش موجود: منسألش اللوحة عليه تاني لمدة دقيقة
const MISS_TTL = 60 * 1000;

export const multiTenant = () => Boolean(process.env.PANEL_DATABASE_URL);

export function normalizeCode(code) {
  const c = String(code ?? "")
    .trim()
    .toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

// ------------------------------------------------------------
// الشركة الحالية
// 1) runWithCompany (الدخول، والشغل في الخلفية زي النسخ الاحتياطي)
// 2) الـ cookie بتاعة الطلب
// ------------------------------------------------------------
const als = new AsyncLocalStorage();

export function runWithCompany(code, fn) {
  return als.run({ code: normalizeCode(code) }, fn);
}

export async function currentCompanyCode() {
  const store = als.getStore();
  if (store) return store.code;
  try {
    return normalizeCode((await cookies()).get(TENANT_COOKIE)?.value);
  } catch {
    // برا طلب (مفيش cookies)
    return null;
  }
}

// ------------------------------------------------------------
// cookie الشركة (الجهاز يفتكر الشركة سنة)
// ------------------------------------------------------------
export const companyCookieOptions = () => ({
  httpOnly: true,
  secure:
    process.env.NODE_ENV === "production" &&
    process.env.COOKIE_SECURE !== "false",
  sameSite: "lax",
  path: "/",
  maxAge: 365 * 24 * 60 * 60,
});

export async function setCompanyCookie(code) {
  (await cookies()).set(TENANT_COOKIE, code, companyCookieOptions());
}

export async function clearCompanyCookies() {
  const { SESSION_COOKIE } = await import("./session-config");
  const store = await cookies();
  store.delete(TENANT_COOKIE);
  store.delete(SESSION_COOKIE);
}

// ------------------------------------------------------------
// الكاش: ذاكرة + ملف
// ------------------------------------------------------------
const g = globalThis;
g.__erpTenants ??= { map: null, misses: new Map() };
const state = g.__erpTenants;

function loadFile() {
  if (state.map) return state.map;
  state.map = new Map();
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    for (const [code, t] of Object.entries(data)) state.map.set(code, t);
  } catch {
    // مفيش ملف لسه
  }
  return state.map;
}

function saveFile() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const tmp = `${CACHE_FILE}.tmp`;
    // باسورد القاعدة بيتحفظ متشفّر زي ما هو جاي من اللوحة
    fs.writeFileSync(
      tmp,
      JSON.stringify(Object.fromEntries(state.map), null, 2),
      "utf8",
    );
    fs.renameSync(tmp, CACHE_FILE);
  } catch (e) {
    console.error("[tenant] cache write failed:", e?.message);
  }
}

// ------------------------------------------------------------
// سؤال لوحة التحكم (مرة واحدة لكل شركة)
// ------------------------------------------------------------
function panelConfig() {
  const url = new URL(process.env.PANEL_DATABASE_URL);
  return {
    host: url.hostname === "localhost" ? "127.0.0.1" : url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    allowPublicKeyRetrieval: true,
  };
}

async function askPanel(code) {
  let conn;
  try {
    conn = await mariadb.createConnection({
      ...panelConfig(),
      connectTimeout: 5000,
    });
    const rows = await conn.query(
      `SELECT c.code, c.serialNo, c.arName, c.enName, c.dbName, c.dbUser,
              c.dbPasswordEnc, c.provisionedAt, a.background
         FROM companies c LEFT JOIN activities a ON a.id = c.activityId
        WHERE c.code = ? LIMIT 1`,
      [code],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      code: r.code,
      serialNo: r.serialNo,
      arName: r.arName,
      enName: r.enName,
      dbName: r.dbName,
      dbUser: r.dbUser,
      dbPasswordEnc: r.dbPasswordEnc,
      provisioned: Boolean(r.provisionedAt),
      background: r.background ?? null,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    await conn?.end().catch(() => {});
  }
}

// أكواد كل الشركات الجاهزة (للشغل في الخلفية: النسخ التلقائي والزكاة)
// بنسأل اللوحة مرة كل 10 دقايق بس
export async function listCompanyCodes() {
  const c = state.codes;
  if (c && Date.now() - c.at < 10 * 60 * 1000) return c.value;
  let conn;
  try {
    conn = await mariadb.createConnection({
      ...panelConfig(),
      connectTimeout: 5000,
    });
    const rows = await conn.query(
      "SELECT code FROM companies WHERE provisionedAt IS NOT NULL AND status <> 'cancelled' ORDER BY serialNo",
    );
    const value = rows.map((r) => r.code);
    state.codes = { at: Date.now(), value };
    return value;
  } catch (e) {
    // اللوحة مش بترد: آخر قايمة، أو الشركات اللي في الكاش
    console.error("[tenant] company list failed:", e?.message);
    return c?.value ?? [...loadFile().keys()];
  } finally {
    await conn?.end().catch(() => {});
  }
}

// بيانات الشركة من الكود (null = مش موجودة)
// refresh: نسأل اللوحة من جديد (مثلاً الاتصال بالقاعدة فشل)
export async function resolveCompany(code, { refresh = false } = {}) {
  const c = normalizeCode(code);
  if (!c) return null;
  const map = loadFile();
  if (!refresh) {
    const hit = map.get(c);
    if (hit?.provisioned) return hit;
    // شركة لسه قاعدتها متعملتش: نعيد السؤال كل دقيقة بس
    if (hit && Date.now() - Date.parse(hit.fetchedAt) < MISS_TTL) return hit;
    const miss = state.misses.get(c);
    if (miss && Date.now() - miss < MISS_TTL && !hit) return null;
  }
  const t = await askPanel(c);
  if (!t) {
    state.misses.set(c, Date.now());
    if (map.delete(c)) saveFile();
    return null;
  }
  state.misses.delete(c);
  map.set(c, t);
  saveFile();
  return t;
}

// نسيان شركة من الكاش (هتتسأل اللوحة عليها تاني)
export function forgetCompany(code) {
  const c = normalizeCode(code);
  if (c && loadFile().delete(c)) saveFile();
}

// بيانات الاتصال بقاعدة الشركة (نفس سيرفر MySQL بتاع اللوحة)
export function tenantDbConfig(t) {
  const base = panelConfig();
  return {
    host: base.host,
    port: base.port,
    user: t.dbUser,
    password: decryptPanelSecret(t.dbPasswordEnc),
    database: t.dbName,
    allowPublicKeyRetrieval: true,
  };
}

// الشركة الحالية كاملة (null = مفيش شركة أو مش موجودة)
export async function currentCompany() {
  const code = await currentCompanyCode();
  return code ? resolveCompany(code) : null;
}

// اسم الشركة وصورة نشاطها لشاشة الدخول
export function companyBranding(t) {
  if (!t) return null;
  const panelUrl = (process.env.PANEL_URL ?? "").replace(/\/+$/, "");
  const bg = t.background;
  return {
    code: t.code,
    arName: t.arName,
    enName: t.enName,
    image: !bg
      ? null
      : /^https?:\/\//i.test(bg)
        ? bg
        : panelUrl
          ? `${panelUrl}/api/uploads/${bg}`
          : null,
  };
}
