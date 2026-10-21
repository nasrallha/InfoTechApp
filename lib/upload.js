import "server-only";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { AppError } from "./errors";

// كل الصور المرفوعة تُحفظ في مجلد uploads في جذر المشروع
// (خارج public، لأن Next في وضع الإنتاج لا يعرض الملفات المضافة لـ public بعد البناء)
export const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

// التعرف على نوع الصورة من أول بايتات في الملف (أدق من الاسم أو النوع الذي يرسله المتصفح)
function detectImageExt(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return ".png";
  if (
    bytes.slice(0, 4).toString("ascii") === "RIFF" &&
    bytes.slice(8, 12).toString("ascii") === "WEBP"
  ) {
    return ".webp";
  }
  return null;
}

// حفظ صورة في مجلد معيّن، وترجع المسار الذي نخزنه في قاعدة البيانات
// مثال: saveImage(file, "categories") ← "categories/3f2a....webp"
export async function saveImage(file, folder) {
  const bytes = Buffer.from(await file.arrayBuffer());

  const ext = detectImageExt(bytes);
  if (!ext) throw new AppError("AllowedImageTypes");

  const dir = path.join(UPLOADS_ROOT, folder);
  await mkdir(dir, { recursive: true });

  // اسم عشوائي حتى لا تتكرر الأسماء ولا يُستبدل ملف بملف
  const fileName = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, fileName), bytes);

  return `${folder}/${fileName}`;
}

// حذف صورة (لو موجودة). لا يرمي خطأ لو الملف غير موجود
export async function deleteImage(relativePath) {
  if (!relativePath) return;

  const fullPath = path.join(UPLOADS_ROOT, relativePath);

  // حماية: لا نحذف أي ملف خارج مجلد uploads
  if (!fullPath.startsWith(UPLOADS_ROOT + path.sep)) return;

  try {
    await unlink(fullPath);
  } catch {
    // الملف غير موجود: لا مشكلة
  }
}
