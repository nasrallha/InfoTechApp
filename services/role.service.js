import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { can, isOwnerPermission } from "@/lib/permissions";
import { multiTenant } from "@/lib/tenant";
import { customRolesAllowed } from "@/lib/plan-features";

// الحقول التي نرجعها للواجهة
const roleSelect = {
  id: true,
  arName: true,
  enName: true,
  isActive: true,
  isSuper: true,
  templateKey: true,
  isCustomized: true,
  permissions: { select: { permission: true } },
  _count: { select: { users: true } },
};

// صلاحيات الدور كقائمة نصوص بدل كائنات
const toDTO = ({ permissions, _count, ...role }) => ({
  ...role,
  permissions: permissions.map((p) => p.permission),
  usersCount: _count.users,
});

// ------------------------------------------------------------
// القراءة
// ------------------------------------------------------------

// كل الأدوار (لجدول الأدوار)
export async function getRoles() {
  // دور مالك البرنامج مخفي
  const roles = await prisma.role.findMany({
    where: { isOwner: false },
    orderBy: { id: "asc" },
    select: roleSelect,
  });
  return roles.map(toDTO);
}

// الأدوار النشطة فقط (لقائمة الاختيار في فورم المستخدم)
// غير مدير النظام لا يرى دور "مدير النظام" لأنه لا يقدر يعطيه لأحد
export async function getActiveRoles(currentUser) {
  return prisma.role.findMany({
    where: {
      isActive: true,
      isOwner: false,
      ...(currentUser?.isSuper ? {} : { isSuper: false }),
    },
    orderBy: { id: "asc" },
    select: { id: true, arName: true, enName: true, isSuper: true },
  });
}

// ------------------------------------------------------------
// قواعد مساعدة
// ------------------------------------------------------------

// P2002 = مخالفة @unique (اسم الدور مكرر)
function handleUniqueError(error) {
  if (error?.code === "P2002") throw new AppError("RoleNameExists");
  throw error;
}

// الأدوار الثابتة (من لوحة التحكم): مقفولة
// والأدوار العادية: بس لو الباقة فيها "أدوار خاصة" (مدير النظام مستثنى)
// التحكم في الأدوار: لمدير النظام لو الباقة فيها "أدوار خاصة"، ولمالك البرنامج دايماً
async function canManageCustomRoles(currentUser) {
  return Boolean(currentUser?.isOwner) || (await customRolesAllowed());
}

async function assertEditable(role, currentUser) {
  // الأدوار الثابتة مقفولة في وضع الشركات بس (قاعدتك المرجعية بتعدّل فيها عادي)
  // مالك البرنامج ومدير النظام: يعدّلوا الدور الثابت (اسمه وصلاحياته) للشركة دي
  // (بيتعلّم «معدَّل للشركة» واللوحة متكتبش فوقه، والمقفول من اللوحة ميتديش)
  if (
    role.templateKey &&
    multiTenant() &&
    !currentUser?.isOwner &&
    !currentUser?.isSuper
  )
    throw new AppError("TemplateRoleLocked");
  if (!(await canManageCustomRoles(currentUser)))
    throw new AppError("CustomRolesNotInPlan");
}

// دور "مدير النظام" لا يتعامل معه (إنشاء/تعديل/حذف) إلا مدير نظام
function assertCanManageSuper(isSuperRole, currentUser) {
  if (isSuperRole && !currentUser.isSuper) throw new AppError("OnlySuperCanManageSuperRole");
}

// ------------------------------------------------------------
// الإضافة والتعديل
// ------------------------------------------------------------

export async function createRole(data, currentUser) {
  assertCanManageSuper(data.isSuper, currentUser);
  if (!(await canManageCustomRoles(currentUser)))
    throw new AppError("CustomRolesNotInPlan");

  try {
    return toDTO(await prisma.role.create({ data, select: roleSelect }));
  } catch (error) {
    handleUniqueError(error);
  }
}

export async function updateRole({ id, ...data }, currentUser) {
  const current = await prisma.role.findUnique({
    where: { id },
    select: { isSuper: true, isActive: true, isOwner: true, templateKey: true },
  });
  if (!current || current.isOwner) throw new AppError("RoleNotFound");
  await assertEditable(current, currentUser);

  assertCanManageSuper(current.isSuper || data.isSuper, currentUser);

  // لا يعدّل أحد دوره هو (حتى لا يرفع صلاحياته أو يقفل نفسه)
  if (id === currentUser.role.id && !currentUser.isSuper) {
    throw new AppError("CannotEditOwnRole");
  }

  // لو هذا آخر دور مدير نظام وسيُلغى أو يُوقف: لازم يبقى مدير نظام آخر
  if (current.isSuper && (!data.isSuper || !data.isActive)) {
    const otherSupers = await prisma.user.count({
      where: {
        isActive: true,
        isOwner: false,
        role: { isSuper: true, isActive: true, id: { not: id } },
      },
    });
    if (otherSupers === 0) throw new AppError("LastSuperAdmin");
  }

  try {
    return toDTO(
      await prisma.role.update({
        where: { id },
        // دور ثابت اتعدّل للشركة دي ← اللوحة متكتبش فوقه
        data: { ...data, ...customizedMark(current) },
        select: roleSelect,
      }),
    );
  } catch (error) {
    handleUniqueError(error);
  }
}

// الدور الثابت (قالب من اللوحة) في وضع الشركات: علامة «متعدّل للشركة»
const customizedMark = (role) =>
  role.templateKey && multiTenant() ? { isCustomized: true } : {};

// ------------------------------------------------------------
// الصلاحيات
// ------------------------------------------------------------

// حفظ صلاحيات دور: نمسح القديم ونسجل الجديد (في عملية واحدة)
export async function setRolePermissions({ roleId, permissions }, currentUser) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { isSuper: true, isOwner: true, templateKey: true },
  });
  if (!role || role.isOwner) throw new AppError("RoleNotFound");
  await assertEditable(role, currentUser);
  // صلاحيات مالك البرنامج مش بتتدي لأي دور (وفي وضع الشركات: أبداً)
  if (
    (currentUser.ownerMode || multiTenant()) &&
    permissions.some(isOwnerPermission)
  ) {
    throw new AppError("CannotGrantMissingPermission");
  }

  // مدير النظام له كل الصلاحيات تلقائياً، لا نسجل له شيئاً
  if (role.isSuper) throw new AppError("SuperRoleHasAll");

  if (roleId === currentUser.role.id && !currentUser.isSuper) {
    throw new AppError("CannotEditOwnRole");
  }

  // لا يعطي أحد صلاحية هو نفسه لا يملكها
  if (permissions.some((p) => !can(currentUser, p))) {
    throw new AppError("CannotGrantMissingPermission");
  }

  const unique = [...new Set(permissions)];

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: unique.map((permission) => ({ roleId, permission })),
    }),
    // دور ثابت اتعدّلت صلاحياته للشركة دي ← اللوحة متكتبش فوقه
    ...(role.templateKey && multiTenant()
      ? [
          prisma.role.update({
            where: { id: roleId },
            data: { isCustomized: true },
          }),
        ]
      : []),
  ]);

  return { roleId, permissions: unique };
}

// ------------------------------------------------------------
// الحذف
// ------------------------------------------------------------

export async function deleteRoles(ids, currentUser) {
  // دور مالك البرنامج مايتمسحش
  if (await prisma.role.count({ where: { id: { in: ids }, isOwner: true } })) {
    throw new AppError("RoleNotFound");
  }
  if (!(await canManageCustomRoles(currentUser)))
    throw new AppError("CustomRolesNotInPlan");
  // الأدوار الثابتة مبتتمسحش (في وضع الشركات)
  if (
    multiTenant() &&
    await prisma.role.count({
      where: { id: { in: ids }, templateKey: { not: null } },
    })
  ) {
    throw new AppError("TemplateRoleLocked");
  }
  const supers = await prisma.role.count({ where: { id: { in: ids }, isSuper: true } });
  assertCanManageSuper(supers > 0, currentUser);

  // لا نحذف دوراً عليه مستخدمون
  const blocked = await prisma.role.findMany({
    where: {
      id: { in: ids },
      users: { some: {} },
    },
    select: { arName: true, enName: true },
  });

  if (blocked.length > 0) throw new AppError("RoleInUse", blocked);

  // صلاحيات الدور تُحذف تلقائياً (onDelete: Cascade)
  const { count } = await prisma.role.deleteMany({ where: { id: { in: ids } } });
  return { deleted: count };
}
