// إعدادات الصور المشتركة بين الواجهة والسيرفر
export const MAX_IMAGE_SIZE_MB = 2;
export const MAX_IMAGE_SIZE = MAX_IMAGE_SIZE_MB * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// الصورة تُحفظ في قاعدة البيانات كمسار مثل: categories/abc.webp
// وتُعرض في المتصفح عن طريق الرابط: /api/uploads/categories/abc.webp
export function imageUrl(path) {
  return path ? `/api/uploads/${path}` : null;
}
