import { readFile } from "fs/promises";
import path from "path";

// هذا الـ route يعرض الصور المحفوظة في مجلد uploads
// مثال: /api/uploads/categories/abc.webp ← uploads/categories/abc.webp

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(request, { params }) {
  const { path: parts } = await params;
  const filePath = path.join(UPLOADS_ROOT, ...parts);

  // حماية: لا نسمح بقراءة أي ملف خارج مجلد uploads (مثل ../../.env)
  if (!filePath.startsWith(UPLOADS_ROOT + path.sep)) return notFound();

  const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()];
  if (!contentType) return notFound();

  try {
    const data = await readFile(filePath);
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        // اسم الملف عشوائي ولا يتغير محتواه، فنسمح للمتصفح بتخزينه
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return notFound();
  }
}
