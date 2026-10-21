"use server";

// هذه الدوال هي "البوابة" بين الواجهة والسيرفر.
// الواجهة تستدعيها كدالة عادية، وNext يحوّلها لطلب POST للسيرفر.
// أي شخص يقدر يرسل هذا الطلب، لذلك نتحقق من البيانات دائماً هنا.
// permission: الصلاحية المطلوبة (runAction يرفض الطلب لو المستخدم لا يملكها)

import { runAction } from "@/lib/action";
import {
  createCategorySchema,
  updateCategorySchema,
  deleteCategoriesSchema,
} from "@/validations/category.schema";
// ملاحظة: قراءة الأقسام لا تحتاج action،
// لأن صفحة الأقسام (Server Component) تنادي الـ service مباشرة
import {
  createCategory,
  updateCategory,
  deleteCategories,
} from "@/services/category.service";

// الإضافة والتعديل يستقبلان FormData (لأن فيها ملف صورة)
// هذه الدالة تحوّل FormData لكائن عادي بالأنواع الصحيحة قبل التحقق بـ Zod
function readCategoryForm(formData) {
  const parentId = formData.get("parentId");
  const id = formData.get("id");
  const image = formData.get("image");

  return {
    ...(id ? { id: Number(id) } : {}),
    arName: formData.get("arName") ?? "",
    enName: formData.get("enName") ?? "",
    parentId: parentId ? Number(parentId) : null,
    isActive: formData.get("isActive") === "true",
    // ملف فاضي (بدون اختيار صورة) = لا توجد صورة
    image: image instanceof File && image.size > 0 ? image : null,
    removeImage: formData.get("removeImage") === "true",
  };
}

// { refresh: true }: بعد النجاح تتحدث صفحة الأقسام تلقائياً ببيانات جديدة

export async function createCategoryAction(formData) {
  return runAction(
    createCategorySchema,
    readCategoryForm(formData),
    (data) => createCategory(data),
    { permission: "categories.create", refresh: true },
  );
}

export async function updateCategoryAction(formData) {
  return runAction(
    updateCategorySchema,
    readCategoryForm(formData),
    (data) => updateCategory(data),
    { permission: "categories.update", refresh: true },
  );
}

export async function deleteCategoriesAction(ids) {
  return runAction(deleteCategoriesSchema, ids, (data) => deleteCategories(data), {
    permission: "categories.delete",
    refresh: true,
  });
}
