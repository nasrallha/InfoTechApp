// ============================================================
// الرابط الحقيقي اللي المستخدم فاتح منه (للتحويل redirect من الـ route handlers)
// على السيرفر البرنامج شغال ورا Caddy على 127.0.0.1:3000، و request.url في
// الـ route handlers بيطلع http://localhost:3000 ← التحويل كان بيودّي على localhost
// فبناخد الدومين من الهيدرز (X-Forwarded-Host / Host) والبروتوكول من X-Forwarded-Proto
// ============================================================
export function publicUrl(path, request) {
  const h = request.headers;
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "")
    .split(",")[0]
    .trim();
  const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  if (!host) return new URL(path, request.url);
  const scheme =
    proto === "https" || proto === "http"
      ? proto
      : new URL(request.url).protocol.replace(":", "");
  return new URL(path, `${scheme}://${host}`);
}
