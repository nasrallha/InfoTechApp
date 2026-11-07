import "server-only";
import fs from "node:fs";
import path from "node:path";
import mariadb from "mariadb";
import { multiTenant, currentCompanyCode } from "./tenant";
import { getSubscription } from "./subscription";

// ============================================================
// بيانات الشركة المالكة (الدعم الفني) من لوحة التحكم
// - الشركة معروفة: من نسخة الاشتراك جوه قاعدتها (subscription.vendor)
// - لسه مفيش شركة (شاشة الدخول بكود الشركة): من اللوحة مرة كل ساعة،
//   وبتتحفظ في .tenants/vendor.json
// - وضع القاعدة الواحدة: مفيش بيانات (بيظهر اسم البرنامج بس)
// ============================================================

const FILE = path.join(process.cwd(), ".tenants", "vendor.json");
const TTL = 60 * 60 * 1000;
const g = globalThis;

function fromFile() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return null;
  }
}

async function fromPanel() {
  const url = new URL(process.env.PANEL_DATABASE_URL);
  let conn;
  try {
    conn = await mariadb.createConnection({
      host: url.hostname === "localhost" ? "127.0.0.1" : url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
      allowPublicKeyRetrieval: true,
      connectTimeout: 4000,
    });
    const [s] = await conn.query(
      `SELECT vendorArName, vendorEnName, vendorLogo, vendorPhone, vendorPhone2,
              vendorWhatsapp, vendorEmail, vendorWebsite, vendorAddressAr,
              vendorAddressEn, vendorHoursAr, vendorHoursEn
         FROM panel_settings WHERE id = 1`,
    );
    if (!s) return null;
    return {
      arName: s.vendorArName,
      enName: s.vendorEnName,
      logo: s.vendorLogo,
      phone: s.vendorPhone,
      phone2: s.vendorPhone2,
      whatsapp: s.vendorWhatsapp,
      email: s.vendorEmail,
      website: s.vendorWebsite,
      addressAr: s.vendorAddressAr,
      addressEn: s.vendorAddressEn,
      hoursAr: s.vendorHoursAr,
      hoursEn: s.vendorHoursEn,
    };
  } finally {
    await conn?.end().catch(() => {});
  }
}

async function panelVendor() {
  const c = g.__erpVendor;
  if (c && Date.now() - c.at < TTL) return c.value;
  try {
    const value = await fromPanel();
    g.__erpVendor = { at: Date.now(), value };
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(value ?? null), "utf8");
    } catch {
      // مش مشكلة
    }
    return value;
  } catch {
    // اللوحة مش بترد: آخر نسخة محفوظة
    const value = c?.value ?? fromFile();
    g.__erpVendor = { at: Date.now() - TTL + 5 * 60 * 1000, value };
    return value;
  }
}

// رابط الصورة الكامل من اللوحة
function withUrls(v) {
  if (!v) return null;
  const panelUrl = (process.env.PANEL_URL ?? "").replace(/\/+$/, "");
  const logo = !v.logo
    ? null
    : /^https?:\/\//i.test(v.logo)
      ? v.logo
      : panelUrl
        ? `${panelUrl}/api/uploads/${v.logo}`
        : null;
  const website =
    v.website && !/^https?:\/\//i.test(v.website)
      ? `https://${v.website}`
      : v.website || null;
  return { ...v, logo, website };
}

export async function getVendor() {
  if (!multiTenant()) return null;
  try {
    if (await currentCompanyCode()) {
      const sub = await getSubscription();
      if (sub?.vendor) return withUrls(sub.vendor);
    }
  } catch {
    // قاعدة الشركة مش بترد: نكمّل من اللوحة
  }
  return withUrls(await panelVendor());
}
