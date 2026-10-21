import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { hashPassword, verifyPassword, DUMMY_HASH } from "@/lib/password";
import { createSession, deleteCurrentSession } from "@/lib/auth";
import { clientInfo, getSecuritySettings } from "@/lib/security-settings";
import {
  OWNER_DB_USERNAME,
  ensureOwnerUser,
  isOwnerUsername,
  ownerEnabled,
  verifyOwnerPassword,
} from "@/lib/owner";
import {
  checkLoginLocks,
  clearUserLock,
  enforceDeviceLimit,
  housekeeping,
  logLoginAttempt,
  registerLoginFailure,
} from "./login-security.service";

// ------------------------------------------------------------
// هل يوجد أي مستخدم في النظام؟
// لو لا: صفحة الدخول تعرض "إعداد النظام لأول مرة" لإنشاء مدير النظام
// ------------------------------------------------------------
// (حساب المالك المخفي مش بيتحسب: النظام لازم يبقى له مدير نظام حقيقي)
export async function hasAnyUser() {
  return (await prisma.user.count({ where: { isOwner: false } })) > 0;
}

// ------------------------------------------------------------
// تسجيل الدخول
// ------------------------------------------------------------
export async function login({ username, password }) {
  const security = await getSecuritySettings();
  const { ip, userAgent } = await clientInfo();
  const log = (success, reason, userId = null) =>
    logLoginAttempt({ username, userId, success, reason, ip, userAgent });
  housekeeping(security);

  // مقفول مؤقتاً (محاولات غلط كتير): منفحصش الباسورد أصلاً
  const lock = await checkLoginLocks(username, ip, security);
  if (lock) {
    await log(false, lock.kind === "ip" ? "ipLocked" : "locked");
    throw new AppError("LoginLocked", { minutes: lock.minutes });
  }

  // مالك البرنامج: الحساب اللي في ملف الإعدادات (مش في جدول المستخدمين)
  if (
    ownerEnabled() &&
    isOwnerUsername(username) &&
    username !== OWNER_DB_USERNAME
  ) {
    return loginOwner({ username, password, ip, security, log });
  }

  const found = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      password: true,
      isActive: true,
      branchId: true,
      branch: { select: { isActive: true } },
      role: { select: { isActive: true, isSuper: true } },
      isOwner: true,
    },
  });
  // صف المالك المخفي: مينفعش حد يدخل بيه باسم المستخدم بتاعه
  const user = found?.isOwner ? null : found;

  // نتحقق من كلمة المرور حتى لو المستخدم غير موجود (بـ hash وهمي)
  // حتى لا يُعرف من سرعة الرد هل اسم المستخدم موجود أم لا
  const valid = await verifyPassword(password, user?.password ?? DUMMY_HASH);

  // نفس الرسالة للحالتين: لا نقول للمهاجم أي جزء هو الخطأ
  // (والعداد بيشتغل حتى على الأسماء اللي مش موجودة لنفس السبب)
  if (!user || !valid) {
    const r = await registerLoginFailure(username, ip, security);
    await log(false, "invalid", user?.id ?? null);
    if (r.locked) throw new AppError("LoginLocked", { minutes: r.minutes });
    const showLeft = security.showRemaining && r.remaining != null;
    throw new AppError(
      showLeft ? "InvalidCredentialsLeft" : "InvalidCredentials",
      showLeft ? { remaining: r.remaining } : null,
    );
  }

  if (!user.isActive || !user.role.isActive) {
    await log(false, "disabled", user.id);
    throw new AppError("AccountDisabled");
  }

  // الفرع الذي سيفتح عليه: فرعه الأساسي
  let branchId = user.branchId;

  if (!user.branch.isActive) {
    // فرعه الأساسي موقوف: مدير النظام يدخل على أول فرع نشط، وغيره لا يدخل
    const firstActive = user.role.isSuper
      ? await prisma.branch.findFirst({
          where: { isActive: true },
          orderBy: { id: "asc" },
          select: { id: true },
        })
      : null;
    if (!firstActive) {
      await log(false, "branchInactive", user.id);
      throw new AppError("BranchInactive");
    }
    branchId = firstActive.id;
  }

  // الباسورد صح: عداد المحاولات الغلط يرجع صفر
  await clearUserLock(username);

  // عدد الأجهزة المسموح (يخرج أقدم جهاز أو يرفض حسب الإعداد)
  try {
    await enforceDeviceLimit(user, security);
  } catch (error) {
    if (error instanceof AppError) await log(false, "deviceLimit", user.id);
    throw error;
  }

  // تنظيف الجلسات المنتهية لهذا المستخدم + تسجيل وقت آخر دخول
  await prisma.$transaction([
    prisma.session.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  await createSession(user.id, branchId);
  await log(true, "ok", user.id);
}

// دخول مالك البرنامج (نفس القفل بعد المحاولات الغلط وسجل الدخول)
async function loginOwner({ username, password, ip, security, log }) {
  const valid = await verifyOwnerPassword(password);
  if (!valid) {
    const r = await registerLoginFailure(username, ip, security);
    await log(false, "invalid");
    if (r.locked) throw new AppError("LoginLocked", { minutes: r.minutes });
    const showLeft = security.showRemaining && r.remaining != null;
    throw new AppError(
      showLeft ? "InvalidCredentialsLeft" : "InvalidCredentials",
      showLeft ? { remaining: r.remaining } : null,
    );
  }
  await clearUserLock(username);
  const owner = await ensureOwnerUser();
  await prisma.user.update({
    where: { id: owner.id },
    data: { lastLoginAt: new Date() },
  });
  await createSession(owner.id, owner.branchId);
  await log(true, "ok", owner.id);
}

// ------------------------------------------------------------
// إعداد النظام لأول مرة: إنشاء دور "مدير النظام" وفرع رئيسي وأول مستخدم
// يعمل مرة واحدة فقط (لو يوجد أي مستخدم يُرفض)
// ------------------------------------------------------------
export async function setupFirstAdmin({
  arFullname,
  enFullname,
  username,
  password,
  currencyId,
}) {
  const passwordHash = await hashPassword(password);

  const admin = await prisma.$transaction(async (tx) => {
    if ((await tx.user.count({ where: { isOwner: false } })) > 0)
      throw new AppError("SetupAlreadyDone");

    // دور مدير النظام: نستخدم الموجود لو فيه، وإلا ننشئه
    const role =
      (await tx.role.findFirst({
        where: { isSuper: true },
        select: { id: true },
      })) ??
      (await tx.role.upsert({
        where: { enName: "System Admin" },
        update: { isSuper: true, isActive: true },
        create: {
          arName: "مدير النظام",
          enName: "System Admin",
          isSuper: true,
        },
        select: { id: true },
      }));

    // الفرع: أول فرع نشط، وإلا ننشئ "الفرع الرئيسي"
    const branch =
      (await tx.branch.findFirst({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      })) ??
      (await tx.branch.create({
        data: { arName: "الفرع الرئيسي", enName: "Main Branch", address: "-" },
        select: { id: true },
      }));

    // العملة الأساسية للبرنامج: التي اختارها في شاشة الإعداد
    if (currencyId) {
      const currency = await tx.currency.findUnique({
        where: { id: currencyId },
        select: { id: true },
      });
      if (!currency) throw new AppError("CurrencyNotFound");
      await tx.currency.updateMany({ data: { isBase: false } });
      await tx.currency.update({
        where: { id: currencyId },
        data: { isBase: true, isActive: true },
      });
    }

    return tx.user.create({
      data: {
        arFullname,
        enFullname,
        username,
        password: passwordHash,
        roleId: role.id,
        branchId: branch.id,
        lastLoginAt: new Date(),
      },
      select: { id: true, branchId: true },
    });
  });

  // ندخله مباشرة بعد الإعداد
  await createSession(admin.id, admin.branchId);
}

// ------------------------------------------------------------
// تسجيل الخروج
// ------------------------------------------------------------
export async function logout() {
  await deleteCurrentSession();
}

// ------------------------------------------------------------
// تغيير الفرع الحالي (مدير النظام فقط)
// ------------------------------------------------------------
export async function switchBranch(branchId, user) {
  if (!user.isSuper) throw new AppError("Forbidden");

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { isActive: true },
  });
  if (!branch?.isActive) throw new AppError("BranchNotFound");

  await prisma.session.update({
    where: { id: user.sessionId },
    data: { branchId },
  });
}

// الفروع النشطة لقائمة تغيير الفرع في الهيدر
export async function getSwitchableBranches(user) {
  if (!user.isSuper) return [];
  return prisma.branch.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: { id: true, arName: true, enName: true },
  });
}
