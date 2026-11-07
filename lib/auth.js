import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "@/i18n/routing";
import { SESSION_COOKIE } from "@/lib/session-config";
import { clientInfo, getSecuritySettings } from "@/lib/security-settings";
import { can, isOwnerPermission } from "@/lib/permissions";
import { ownerEnabled } from "@/lib/owner";
import { notFound } from "next/navigation";
import { currentCompanyCode, multiTenant } from "@/lib/tenant";
import { getSubscription, isBlocked } from "@/lib/subscription";
import { blockedPermissions, readonlyBlocked } from "@/lib/plan-catalog";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { moduleBlockedPermissions } from "@/lib/module-catalog";
import { enabledModules } from "@/lib/modules";

// ============================================================
// الجلسات (Sessions) والمستخدم الحالي
// - الـ cookie فيها رقم عشوائي طويل (token)
// - قاعدة البيانات فيها hash الـ token فقط + المستخدم + الفرع الحالي
// - كل طلب: نقرأ الـ cookie ← نجيب الجلسة ← نتأكد أنها صالحة والمستخدم نشط
// ============================================================

// سماح بسيط فوق مدة عدم النشاط (الواجهة بتبعت آخر نشاط كل دقيقة + دقيقة التنبيه)
const IDLE_GRACE_MINUTES = 2;

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

const branchSelect = { id: true, arName: true, enName: true, isActive: true };

// ------------------------------------------------------------
// إنشاء وحذف الجلسات (من الـ Server Actions فقط، لأنها تكتب cookie)
// ------------------------------------------------------------

// المدة من إعدادات الدخول (أقصى مدة للجلسة)، والـ cookie تتمسح مع قفل المتصفح لو الإعداد كده
export async function createSession(userId, branchId) {
  const token = randomBytes(32).toString("base64url");
  const security = await getSecuritySettings();
  const expiresAt = new Date(
    Date.now() + security.sessionHours * 60 * 60 * 1000,
  );
  const { ip, userAgent } = await clientInfo();

  const session = await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      branchId,
      userAgent,
      ip,
      expiresAt,
      lastSeenAt: new Date(),
    },
    select: { id: true },
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // الـ JavaScript في المتصفح لا يقدر يقرأها
    // https فقط في الإنتاج. لو النظام يعمل على شبكة محلية بدون https
    // ضع COOKIE_SECURE=false في ملف .env وإلا لن يعمل تسجيل الدخول
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.COOKIE_SECURE !== "false",
    sameSite: "lax",
    path: "/",
    // بدون expires = cookie مؤقتة تتمسح لما المتصفح يتقفل
    ...(security.logoutOnBrowserClose ? {} : { expires: expiresAt }),
  });
  return session.id;
}

// تسجيل الخروج: حذف الجلسة الحالية من قاعدة البيانات ومن المتصفح
export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

// حذف كل جلسات مستخدمين معيّنين (عند إيقافهم، نقلهم لفرع آخر، تغيير كلمة المرور)
// exceptSessionId: لا نحذف جلسة المستخدم الحالي لو غيّر كلمة مروره بنفسه
export async function deleteUserSessions(userIds, exceptSessionId = null) {
  await prisma.session.deleteMany({
    where: {
      userId: { in: userIds },
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
  });
}

// آخر نشاط للجلسة (من الواجهة لما المستخدم يكون شغال فعلاً)
export async function touchSession(sessionId) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { lastSeenAt: new Date() },
    select: { id: true },
  });
}

// ------------------------------------------------------------
// المستخدم الحالي
// cache: لو استدعيناها أكثر من مرة في نفس الطلب، قاعدة البيانات تُسأل مرة واحدة
// ------------------------------------------------------------

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  // وضع الشركات: مفيش شركة مختارة على الجهاز ← مش مسجل دخول
  if (multiTenant() && !(await currentCompanyCode())) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      lastSeenAt: true,
      branch: { select: branchSelect },
      user: {
        select: {
          id: true,
          username: true,
          arFullname: true,
          enFullname: true,
          image: true,
          isActive: true,
          isOwner: true,
          branchId: true,
          role: {
            select: {
              id: true,
              arName: true,
              enName: true,
              isActive: true,
              isSuper: true,
              permissions: { select: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (!session) return null;

  const { user, branch } = session;

  // جلسة منتهية (أقصى مدة، أو عدم نشاط حسب إعدادات الدخول): نحذفها
  // آخر نشاط بيتحدّث من الواجهة لما المستخدم يحرّك الماوس أو يكتب (touchSession)
  // مش مع كل طلب، عشان التحديث التلقائي في الخلفية ميخليش الجلسة شغالة للأبد
  const now = Date.now();
  const { idleMinutes } = await getSecuritySettings();
  const idleExpired =
    idleMinutes > 0 &&
    now - new Date(session.lastSeenAt).getTime() >
      (idleMinutes + IDLE_GRACE_MINUTES) * 60_000;
  if (session.expiresAt.getTime() < now || idleExpired) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // المستخدم أو دوره أو فرعه موقوف ← كأنه غير مسجل دخول
  if (!user.isActive || !user.role.isActive || !branch.isActive) return null;

  // حساب المالك اتشال من ملف الإعدادات: الجلسة بتاعته مبقتش صالحة
  const ownerMode = ownerEnabled();
  if (user.isOwner && !ownerMode) return null;

  // الاشتراك موقوف أو منتهي ← كأنه غير مسجل دخول (مالك البرنامج بيدخل عادي للدعم)
  const sub = await getSubscription();
  if (!user.isOwner && isBlocked(sub)) return null;
  // صلاحيات مقفولة لأنها مش في الباقة (مالك البرنامج: مفيش)
  // + فترة "قراءة فقط": كل صلاحيات الإضافة والتعديل والحذف مقفولة
  const planBlocked = user.isOwner
    ? []
    : [
        ...new Set([
          ...blockedPermissions(sub?.features),
          ...(sub?.state === "readonly"
            ? readonlyBlocked(ALL_PERMISSIONS)
            : []),
        ]),
      ];
  // وحدات النشاط المفعّلة (المقفولة صلاحياتها مقفولة على الكل)
  const modules = await enabledModules();
  // إعدادات الوحدات اللي الواجهة محتاجاها (من غير طلب زيادة لو الوحدة مقفولة)
  // + allowDuplicateLines: تكرار نفس الصنف في سطور الفاتورة (عام لكل الأنشطة)
  const appSettings = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: {
      serialRequired: true,
      allowDuplicateLines: true,
      staffTitle: true,
      dayStartHour: true,
    },
  });
  const moduleSettings = {
    allowDuplicateLines: appSettings?.allowDuplicateLines ?? false,
    // بداية يوم العمل (التقارير والورديات): 0 = منتصف الليل
    dayStartHour: appSettings?.dayStartHour ?? 0,
    ...(modules.includes("serials")
      ? { serialRequired: appSettings?.serialRequired ?? true }
      : {}),
    // اسم مقدم الخدمة (فني / عاملة / حلاق / معالج): ثابت للنشاط لو اللوحة حددته
    // (الفنيين أو الحجوزات: الاتنين بيعرضوا مقدم الخدمة)
    ...(modules.includes("technicians") || modules.includes("bookings")
      ? {
          staffTitle:
            sub?.staffTitle ?? appSettings?.staffTitle ?? "technician",
          staffTitleFixed: Boolean(sub?.staffTitle),
        }
      : {}),
  };

  // نرجع للواجهة فقط ما تحتاجه (بدون كلمة المرور أو الـ token)
  return {
    id: user.id,
    username: user.username,
    arFullname: user.arFullname,
    enFullname: user.enFullname,
    image: user.image,
    isSuper: user.role.isSuper,
    isOwner: user.isOwner,
    // حساب المالك متعرّف: صلاحيات المالك للمالك بس (lib/permissions)
    ownerMode,
    permissions: user.role.permissions.map((p) => p.permission),
    role: {
      id: user.role.id,
      arName: user.role.arName,
      enName: user.role.enName,
    },
    planBlocked,
    modules,
    moduleBlocked: moduleBlockedPermissions(modules),
    moduleSettings,
    homeBranchId: user.branchId, // الفرع الأساسي للمستخدم
    branch: { id: branch.id, arName: branch.arName, enName: branch.enName }, // الفرع الحالي
    sessionId: session.id,
  };
});

// للصفحات: لو غير مسجل دخول نحوله لصفحة الدخول
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    const locale = await getLocale();
    redirect({ href: "/login", locale });
  }
  return user;
}

// للصفحات: مسجل دخول؟ (وإلا صفحة الدخول) + هل يملك صلاحية فتح الصفحة؟
// الاستخدام: const { allowed } = await getPageAccess("units.view");
//            if (!allowed) return <NoAccess />;
// صفحات المالك: لغيره "الصفحة غير موجودة" (مش "ممنوع") عشان محدش يعرف إنها موجودة
export async function getPageAccess(permission) {
  const user = await requireUser();
  const allowed = can(user, permission);
  if (!allowed && user.ownerMode && isOwnerPermission(permission)) notFound();
  return { user, allowed };
}
