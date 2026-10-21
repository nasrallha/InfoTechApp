import { z } from "zod";
import { nameField, idField, idsField, imageField } from "./common.schema";

// بيانات إضافة قسم
export const createCategorySchema = z.object({
  arName: nameField(),
  enName: nameField(),

  // القسم الأب اختياري: لو فاضي يصبح null (قسم رئيسي)
  parentId: idField.nullish().transform((v) => v ?? null),

  isActive: z.boolean().default(true),

  image: imageField,
});

// بيانات تعديل قسم = نفس بيانات الإضافة + رقم القسم
// removeImage = true معناها: المستخدم شال الصورة الحالية ولم يرفع غيرها
export const updateCategorySchema = createCategorySchema.extend({
  id: idField,
  removeImage: z.boolean().default(false),
});

// حذف قسم أو عدة أقسام
export const deleteCategoriesSchema = idsField;
