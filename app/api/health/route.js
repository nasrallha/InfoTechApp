import { connection } from "next/server";
import { prisma } from "@/lib/prisma";

// ============================================================
// فحص سريع إن السيرفر وقاعدة البيانات شغالين
// بتستخدمه شاشة "مشكلة في الاتصال" (ConnectionStatus) وصفحة offline.html
// 200 { ok: true }            ← كله تمام
// 503 { ok: false, db: false } ← السيرفر شغال بس قاعدة البيانات واقفة
// (لو السيرفر نفسه واقع: الطلب مش هيوصل أصلاً)
// ============================================================
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  await connection();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 4000),
      ),
    ]);
    return Response.json({ ok: true, db: true }, { headers: noStore });
  } catch (e) {
    // مفيش شركة على الجهاز (صفحة الدخول قبل الكود / لينك الحجز للعملاء):
    // السيرفر شغال ومفيش قاعدة نفحصها
    if (e?.code === "NoCompany" || e?.code === "CompanyNotFound")
      return Response.json({ ok: true, db: null }, { headers: noStore });
    return Response.json(
      { ok: false, db: false },
      { status: 503, headers: noStore },
    );
  }
}
