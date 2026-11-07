import "server-only";
import { currentCompanyCode, multiTenant } from "./tenant";

// ============================================================
// حالة في الذاكرة لكل شركة لوحدها (وضع الشركات)
// زي: نسخة احتياطية شغالة، استرجاع شغال، كاش الإعدادات
// (وضع القاعدة الواحدة: مفتاح واحد "_")
// ============================================================
export async function tenantKey() {
  if (!multiTenant()) return "_";
  return (await currentCompanyCode()) ?? "_none";
}

const g = globalThis;
g.__erpTenantFlags ??= new Map(); // name → Set(keys)
g.__erpTenantCache ??= new Map(); // name → Map(key → { at, value })

const flags = (name) => {
  if (!g.__erpTenantFlags.has(name)) g.__erpTenantFlags.set(name, new Set());
  return g.__erpTenantFlags.get(name);
};
const caches = (name) => {
  if (!g.__erpTenantCache.has(name)) g.__erpTenantCache.set(name, new Map());
  return g.__erpTenantCache.get(name);
};

// علامة (زي "backupRunning") للشركة الحالية
export async function hasFlag(name) {
  return flags(name).has(await tenantKey());
}
export async function setFlag(name, on) {
  const key = await tenantKey();
  if (on) flags(name).add(key);
  else flags(name).delete(key);
}

// كاش قيمة للشركة الحالية
export async function getCached(name, ttl) {
  const c = caches(name).get(await tenantKey());
  return c && Date.now() - c.at < ttl ? c.value : undefined;
}
export async function setCached(name, value) {
  caches(name).set(await tenantKey(), { at: Date.now(), value });
}
export async function clearCached(name) {
  caches(name).delete(await tenantKey());
}
