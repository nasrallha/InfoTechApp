import { connection } from "next/server";
import { getVendor } from "@/lib/vendor";
import { circleIconSvg } from "@/lib/circle-icon";

// ============================================================
// لوجو الشركة المنفذة (InfoTech) من لوحة التحكم ← عن طريق البرنامج
// - السيرفر بيجيبه من اللوحة (حتى لو رابطها داخلي) ويحفظه في الذاكرة
// - ?shape=circle ← أيقونة دايرة لتبويب المتصفح (SVG)
// ============================================================
const g = globalThis;
const TYPES = /^image\/(png|jpe?g|webp|gif|svg\+xml)$/i;
const notFound = () => new Response("Not found", { status: 404 });

// رابط اللوحة العام ممكن مايفتحش من جوه السيرفر نفسه ← اللوحة على نفس السيرفر (3100)
const LOCAL_PANEL = "http://127.0.0.1:3100";

async function fetchImage(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!TYPES.test(type)) return null;
    return { type, bytes: new Uint8Array(await res.arrayBuffer()) };
  } catch {
    return null;
  }
}

async function loadLogo(src) {
  const c = g.__vendorLogoFile;
  if (c?.src === src) return c;
  const local = src.replace(/^https?:\/\/[^/]+/i, LOCAL_PANEL);
  const img = (await fetchImage(src)) ?? (local !== src ? await fetchImage(local) : null);
  if (!img) return null;
  const file = { src, ...img };
  g.__vendorLogoFile = file;
  return file;
}

export async function GET(request) {
  // وقت الطلب (مش وقت البناء): الشعار والشركة بيتغيروا
  await connection();
  const vendor = await getVendor().catch(() => null);
  if (!vendor?.logoSrc) return notFound();
  const file = await loadLogo(vendor.logoSrc).catch(() => null);
  if (!file) return notFound();
  // الرابط فيه اسم الملف (v) ← نفس الرابط = نفس الصورة
  const cache = "public, max-age=86400";
  if (new URL(request.url).searchParams.get("shape") === "circle")
    return new Response(circleIconSvg(file.bytes, file.type), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": cache },
    });
  return new Response(file.bytes, {
    headers: { "Content-Type": file.type, "Cache-Control": cache },
  });
}
