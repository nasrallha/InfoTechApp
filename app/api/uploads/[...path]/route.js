import { readFile } from "fs/promises";
import path from "path";
import { uploadsRoot } from "@/lib/upload";
import { runWithCompany } from "@/lib/tenant";

// هذا الـ route يعرض الصور المحفوظة في مجلد uploads
// مثال: /api/uploads/categories/abc.webp ← uploads/categories/abc.webp
// وضع الشركات: من مجلد الشركة اللي على الجهاز (uploads/<الكود>/categories/abc.webp)

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// المجلدات اللي بتتعرض في الصفحات العامة
const PUBLIC_FOLDERS = new Set(["company", "products"]);

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(request, { params }) {
  const { path: parts } = await params;
  // صفحات من غير تسجيل دخول (لينك الحجز / الطلب الأونلاين): ?c=كود الشركة
  // لوجو الشركة + صور الأصناف (المنيو) بس
  const code = new URL(request.url).searchParams.get("c");
  let root;
  try {
    root =
      code && PUBLIC_FOLDERS.has(parts[0])
        ? await runWithCompany(code, () => uploadsRoot())
        : await uploadsRoot();
  } catch {
    return notFound(); // مفيش شركة على الجهاز
  }
  const filePath = path.join(root, ...parts);

  // حماية: لا نسمح بقراءة أي ملف خارج مجلد الصور (مثل ../../.env)
  if (!filePath.startsWith(root + path.sep)) return notFound();

  const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()];
  if (!contentType) return notFound();

  try {
    const data = await readFile(filePath);
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        // اسم الملف عشوائي ولا يتغير محتواه، فنسمح للمتصفح بتخزينه
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return notFound();
  }
}
