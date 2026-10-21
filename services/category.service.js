import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { saveImage, deleteImage } from "@/lib/upload";

// مجلد صور الأقسام داخل uploads
const IMAGES_FOLDER = "categories";

// الحقول التي نرجعها للواجهة (لا نرجع كل شيء من قاعدة البيانات)
const categorySelect = {
  id: true,
  arName: true,
  enName: true,
  image: true,
  isActive: true,
  parentId: true,
};

// ------------------------------------------------------------
// القراءة
// ------------------------------------------------------------

// كل الأقسام الرئيسية ومعها أقسامها الفرعية (لعرض الشجرة)
export async function getCategoriesTree() {
  return prisma.category.findMany({
    where: { parentId: null },
    orderBy: { id: "asc" },
    select: {
      ...categorySelect,
      children: {
        orderBy: { id: "asc" },
        select: categorySelect,
      },
    },
  });
}

// الأقسام الرئيسية فقط (لقائمة "القسم الرئيسي" في الفورم)
export async function getMainCategories() {
  return prisma.category.findMany({
    where: { parentId: null },
    orderBy: { id: "asc" },
    select: { id: true, arName: true, enName: true , image: true , isActive: true},
  });
}

// ------------------------------------------------------------
// قواعد مساعدة
// ------------------------------------------------------------

// القسم الأب لازم يكون موجوداً ويكون قسماً رئيسياً (الشجرة مستويان فقط)
async function assertValidParent(parentId) {
  if (parentId === null) return;

  const parent = await prisma.category.findUnique({
    where: { id: parentId },
    select: { parentId: true },
  });

  if (!parent) throw new AppError("ParentCategoryNotFound");
  if (parent.parentId !== null) throw new AppError("ParentMustBeMainCategory");
}

// تحويل خطأ "قيمة مكررة" من قاعدة البيانات إلى رسالة واضحة
// P2002 = كود Prisma لمخالفة @unique
function handleUniqueError(error) {
  if (error?.code === "P2002") {
    throw new AppError("CategoryNameExists");
  }
  throw error;
}

// ------------------------------------------------------------
// الإضافة
// ------------------------------------------------------------

export async function createCategory({ image, ...data }) {
  await assertValidParent(data.parentId);

  // نحفظ الصورة أولاً (لو موجودة) ونخزن مسارها مع القسم
  const imagePath = image ? await saveImage(image, IMAGES_FOLDER) : null;

  try {
    return await prisma.category.create({
      data: { ...data, image: imagePath },
      select: categorySelect,
    });
  } catch (error) {
    // فشل الحفظ في قاعدة البيانات: نحذف الصورة حتى لا تبقى ملفات بدون قسم
    await deleteImage(imagePath);
    handleUniqueError(error);
  }
}

// ------------------------------------------------------------
// التعديل
// ------------------------------------------------------------

export async function updateCategory({ id, image, removeImage, ...data }) {
  const current = await prisma.category.findUnique({
    where: { id },
    select: { id: true, image: true, _count: { select: { children: true } } },
  });

  if (!current) throw new AppError("CategoryNotFound");

  // القسم لا يكون أباً لنفسه
  if (data.parentId === id) throw new AppError("ParentMustBeMainCategory");

  // قسم رئيسي عنده أقسام فرعية لا يمكن تحويله لقسم فرعي (مستويان فقط)
  if (data.parentId !== null && current._count.children > 0) {
    throw new AppError("CategoryHasChildren");
  }

  await assertValidParent(data.parentId);

  // الصورة: 3 حالات
  //  1) رفع صورة جديدة   ← نحفظها ونستبدل القديمة
  //  2) شال الصورة فقط   ← نخليها null
  //  3) لم يغيّر شيئاً    ← لا نلمس حقل الصورة
  let newImagePath;
  if (image) {
    newImagePath = await saveImage(image, IMAGES_FOLDER);
  } else if (removeImage) {
    newImagePath = null;
  }

  const imageChanged = newImagePath !== undefined;

  try {
    const updated = await prisma.category.update({
      where: { id },
      data: imageChanged ? { ...data, image: newImagePath } : data,
      select: categorySelect,
    });

    // بعد نجاح الحفظ فقط نحذف الصورة القديمة
    if (imageChanged) await deleteImage(current.image);

    return updated;
  } catch (error) {
    // فشل الحفظ: نحذف الصورة الجديدة ونترك القديمة كما هي
    if (newImagePath) await deleteImage(newImagePath);
    handleUniqueError(error);
  }
}

// ------------------------------------------------------------
// الحذف (قسم واحد أو عدة أقسام)
// ------------------------------------------------------------

export async function deleteCategories(ids) {
  // نبحث عن أي قسم من المطلوب حذفهم:
  //  - عليه منتجات
  //  - أو عنده أقسام فرعية لن تُحذف معه
  const blocked = await prisma.category.findMany({
    where: {
      id: { in: ids },
      OR: [
        { products: { some: {} } },
        { children: { some: { id: { notIn: ids } } } },
      ],
    },
    select: { arName: true, enName: true },
  });

  if (blocked.length > 0) {
    // نرجع أسماء الأقسام المستخدمة حتى تعرضها الواجهة
    throw new AppError("CategoryInUse", blocked);
  }

  // نحفظ مسارات الصور قبل الحذف حتى نحذف ملفاتها بعده
  const images = await prisma.category.findMany({
    where: { id: { in: ids }, image: { not: null } },
    select: { image: true },
  });

  // الفرعية أولاً ثم الرئيسية، داخل transaction:
  // إما أن ينجح الحذف كله أو لا يُحذف شيء
  const [children, parents] = await prisma.$transaction([
    prisma.category.deleteMany({
      where: { id: { in: ids }, parentId: { not: null } },
    }),
    prisma.category.deleteMany({
      where: { id: { in: ids }, parentId: null },
    }),
  ]);

  // حذف ملفات الصور بعد نجاح الحذف من قاعدة البيانات
  await Promise.all(images.map((c) => deleteImage(c.image)));

  return { deleted: children.count + parents.count };
}
