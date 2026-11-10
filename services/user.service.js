import "server-only";
import { assertPlanLimit } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { multiTenant } from "@/lib/tenant";
import {
  ALL_PERMISSIONS,
  can,
  isOwnerPermission,
  permissionOverrides,
} from "@/lib/permissions";
import { hashPassword } from "@/lib/password";
import { deleteUserSessions } from "@/lib/auth";
import { saveImage, deleteImage } from "@/lib/upload";
import { isOwnerUsername } from "@/lib/owner";
import { lockedUsernames, userKey } from "./login-security.service";

// مجلد صور المستخدمين داخل uploads
const IMAGES_FOLDER = "users";

// ============================================================
// المستخدمون
// قواعد الفروع:
// - مدير النظام (isSuper): يرى كل المستخدمين في كل الفروع، ويقدر ينقلهم بين الفروع
// - غيره: يرى ويدير مستخدمي فرعه الحالي فقط، ولا يقدر يضيف/يعدّل مدير نظام
// ============================================================

const userSelect = {
  id: true,
  username: true,
  arFullname: true,
  enFullname: true,
  image: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  role: {
    select: {
      id: true,
      arName: true,
      enName: true,
      isSuper: true,
      permissions: { select: { permission: true } },
    },
  },
  // استثناءات المستخدم على صلاحيات دوره
  grantedPermissions: true,
  revokedPermissions: true,
  branch: { select: { id: true, arName: true, enName: true } },
};

// المستخدمون الذين يقدر المستخدم الحالي يراهم ويديرهم
// (حساب مالك البرنامج المخفي مش بيظهر لحد ومحدش يقدر يعدّله من هنا)
const scopeOf = (currentUser) =>
  currentUser.isSuper
    ? { isOwner: false }
    : { isOwner: false, branchId: currentUser.branch.id, role: { isSuper: false } };

// ------------------------------------------------------------
// القراءة
// ------------------------------------------------------------

// lockedUntil: مقفول دلوقتي بسبب محاولات دخول غلط (للعرض + زرار فك القفل)
export async function getUsers(currentUser) {
  const users = await prisma.user.findMany({
    where: scopeOf(currentUser),
    orderBy: { id: "asc" },
    select: userSelect,
  });
  const locks = await lockedUsernames(users.map((u) => u.username));
  return users.map((u) => ({ ...u, lockedUntil: locks.get(userKey(u.username)) ?? null }));
}

// ------------------------------------------------------------
// قواعد مساعدة
// ------------------------------------------------------------

// الدور والفرع لازم يكونوا موجودين ونشطين
// وغير مدير النظام لا يقدر يعطي دور "مدير نظام"
async function assertRoleAndBranch({ roleId, branchId }, currentUser) {
  const [role, branch] = await Promise.all([
    prisma.role.findUnique({
      where: { id: roleId },
      select: { isActive: true, isSuper: true, isOwner: true },
    }),
    prisma.branch.findUnique({ where: { id: branchId }, select: { isActive: true } }),
  ]);

  if (!role?.isActive || role.isOwner)
    throw new AppError("RoleNotFound", null, { roleId: "RoleNotFound" });
  if (!branch?.isActive) throw new AppError("BranchNotFound", null, { branchId: "BranchNotFound" });
  if (role.isSuper && !currentUser.isSuper) {
    throw new AppError("CannotAssignSuperRole", null, { roleId: "CannotAssignSuperRole" });
  }
  return role;
}

// اسم المستخدم لا يتكرر
async function assertUsernameFree(username, excludeId = null) {
  // اسم محجوز لمالك البرنامج (نفس رسالة "موجود" عشان محدش يعرف)
  if (isOwnerUsername(username)) {
    throw new AppError("UsernameExists", null, { username: "UsernameExists" });
  }
  const exists = await prisma.user.findFirst({
    where: { username, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (exists) throw new AppError("UsernameExists", null, { username: "UsernameExists" });
}

// عدد مديري النظام النشطين غير المستخدمين المستثنين
// (لا نسمح أن يصبح النظام بدون أي مدير نظام)
async function countOtherActiveSupers(excludeIds) {
  return prisma.user.count({
    where: { id: { notIn: excludeIds }, isActive: true, isOwner: false, role: { isSuper: true } },
  });
}

function handleUniqueError(error) {
  if (error?.code === "P2002") {
    throw new AppError("UsernameExists", null, { username: "UsernameExists" });
  }
  throw error;
}

// ------------------------------------------------------------
// الإضافة
// ------------------------------------------------------------

export async function createUser({ password, image, ...data }, currentUser) {
  // غير مدير النظام يضيف مستخدمين لفرعه الحالي فقط
  if (!currentUser.isSuper) data.branchId = currentUser.branch.id;

  await assertRoleAndBranch(data, currentUser);
  await assertUsernameFree(data.username);
  // حد المستخدمين في الباقة
  await assertPlanLimit("users", currentUser);

  // نحفظ الصورة أولاً (لو موجودة)، ولو فشل الحفظ في قاعدة البيانات نحذفها
  const imagePath = image ? await saveImage(image, IMAGES_FOLDER) : null;

  try {
    return await prisma.user.create({
      data: { ...data, image: imagePath, password: await hashPassword(password) },
      select: userSelect,
    });
  } catch (error) {
    await deleteImage(imagePath);
    handleUniqueError(error);
  }
}

// ------------------------------------------------------------
// التعديل
// ------------------------------------------------------------

export async function updateUser({ id, password, image, removeImage, ...data }, currentUser) {
  const target = await prisma.user.findFirst({
    where: { id, ...scopeOf(currentUser) },
    select: {
      id: true,
      isActive: true,
      roleId: true,
      branchId: true,
      image: true,
      role: { select: { isSuper: true } },
    },
  });
  if (!target) throw new AppError("UserNotFound");

  const isSelf = target.id === currentUser.id;

  // غير مدير النظام لا ينقل المستخدمين لفرع آخر
  if (!currentUser.isSuper) data.branchId = target.branchId;

  // حماية من قفل الحساب: لا توقف نفسك ولا تغيّر دورك بنفسك
  if (isSelf && !data.isActive) {
    throw new AppError("CannotDisableSelf", null, { isActive: "CannotDisableSelf" });
  }
  if (isSelf && data.roleId !== target.roleId) {
    throw new AppError("CannotChangeOwnRole", null, { roleId: "CannotChangeOwnRole" });
  }

  const newRole = await assertRoleAndBranch(data, currentUser);
  await assertUsernameFree(data.username, id);

  // لو كان مدير نظام وسيُوقف أو يتحول لدور عادي: لازم يبقى مدير نظام آخر
  const losesSuper = target.role.isSuper && (!newRole.isSuper || !data.isActive);
  if (losesSuper && (await countOtherActiveSupers([id])) === 0) {
    throw new AppError("LastSuperAdmin");
  }

  // الصورة: جديدة / حذف الحالية / كما هي (undefined = لا تغيير)
  let newImagePath;
  if (image) newImagePath = await saveImage(image, IMAGES_FOLDER);
  else if (removeImage) newImagePath = null;
  const imageChanged = newImagePath !== undefined;

  let updated;
  try {
    updated = await prisma.user.update({
      where: { id },
      data: {
        ...data,
        ...(imageChanged ? { image: newImagePath } : {}),
        ...(password ? { password: await hashPassword(password) } : {}),
        // دور جديد ← استثناءاته القديمة كانت على الدور القديم: بتتمسح
        ...(data.roleId !== target.roleId
          ? { grantedPermissions: [], revokedPermissions: [] }
          : {}),
      },
      select: userSelect,
    });
  } catch (error) {
    // فشل الحفظ: نحذف الصورة الجديدة التي رفعناها
    if (newImagePath) await deleteImage(newImagePath);
    handleUniqueError(error);
  }

  // الحفظ نجح: نحذف الصورة القديمة من الملفات
  if (imageChanged) await deleteImage(target.image);

  // تغيّرت كلمة المرور أو أُوقف أو نُقل لفرع آخر ← نخرجه من كل أجهزته
  // (لو هو نفسه غيّر كلمة مروره، تبقى جلسته الحالية فقط)
  const mustLogout = Boolean(password) || !data.isActive || data.branchId !== target.branchId;
  if (mustLogout) {
    await deleteUserSessions([id], isSelf ? currentUser.sessionId : null);
  }

  return updated;
}

// ------------------------------------------------------------
// الحذف
// ------------------------------------------------------------

export async function deleteUsers(inputIds, currentUser) {
  const ids = [...new Set(inputIds)];
  if (ids.includes(currentUser.id)) throw new AppError("CannotDeleteSelf");

  const targets = await prisma.user.findMany({
    where: { id: { in: ids }, ...scopeOf(currentUser) },
    select: { id: true, role: { select: { isSuper: true } } },
  });
  if (targets.length !== ids.length) throw new AppError("UserNotFound");

  if (targets.some((u) => u.role.isSuper) && (await countOtherActiveSupers(ids)) === 0) {
    throw new AppError("LastSuperAdmin");
  }

  // صور المستخدمين لنحذفها من الملفات بعد الحذف
  const images = await prisma.user.findMany({
    where: { id: { in: ids }, image: { not: null } },
    select: { image: true },
  });

  // (لاحقاً: نمنع حذف مستخدم عليه فواتير، ونكتفي بإيقافه)
  // الجلسات تُحذف تلقائياً (onDelete: Cascade)
  const { count } = await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await Promise.all(images.map((u) => deleteImage(u.image)));
  return { deleted: count };
}

// ------------------------------------------------------------
// صلاحيات المستخدم (الدور قالب + استثناءات للمستخدم)
// permissions: الصلاحيات المطلوبة للمستخدم (النهائية) من الشاشة
// - مبيعدّلش صلاحياته هو، ولا مستخدم مدير نظام (له كل حاجة)
// - مبيدّيش صلاحية هو نفسه مش عنده (والمقفول على الشركة مبيتدّيش)
// - صلاحيات المالك والمقفولة على الشركة مبتتلمسش
// ------------------------------------------------------------
export async function setUserPermissions({ userId, permissions }, currentUser) {
  if (userId === currentUser.id) throw new AppError("CannotEditOwnPermissions");
  const user = await prisma.user.findFirst({
    where: { id: userId, ...scopeOf(currentUser) },
    select: {
      id: true,
      isOwner: true,
      role: {
        select: {
          isSuper: true,
          permissions: { select: { permission: true } },
        },
      },
    },
  });
  if (!user || user.isOwner) throw new AppError("UserNotFound");
  if (user.role.isSuper) throw new AppError("SuperRoleHasAll");

  // الصلاحيات اللي بتتعدّل: كل الصلاحيات من غير المالك والمقفولة على الشركة
  const blocked = new Set([
    ...(currentUser.moduleBlocked ?? []),
    ...(currentUser.planBlocked ?? []),
  ]);
  const assignable = ALL_PERMISSIONS.filter(
    (p) =>
      !blocked.has(p) &&
      !(
        (currentUser.ownerMode || multiTenant()) &&
        isOwnerPermission(p)
      ),
  );
  const rolePerms = user.role.permissions.map((p) => p.permission);
  const { granted, revoked } = permissionOverrides(
    rolePerms,
    permissions,
    assignable,
  );
  // مبيدّيش صلاحية هو نفسه مش عنده
  if (granted.some((p) => !can(currentUser, p)))
    throw new AppError("CannotGrantMissingPermission");

  await prisma.user.update({
    where: { id: userId },
    data: {
      // فاضي = زي دوره بالظبط
      grantedPermissions: granted,
      revokedPermissions: revoked,
    },
  });
  return { userId, granted, revoked };
}
