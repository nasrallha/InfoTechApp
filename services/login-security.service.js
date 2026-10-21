import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { isOwnerUsername } from "@/lib/owner";
import { dayEnd, dayStart } from "@/lib/dates";
import { lockDuration, parseUserAgent } from "@/lib/login-security";
import {
  getSecuritySettings,
  saveSecuritySettingsRow,
} from "@/lib/security-settings";

// ============================================================
// أمان الدخول
// - القفل المؤقت بعد محاولات غلط (على اسم المستخدم، واختياري على الجهاز IP)
// - سجل محاولات الدخول (ناجحة وفاشلة)
// - الأجهزة المسجّلة (الجلسات): عرض + إنهاء جلسة / كل جلسات مستخدم
// - فك القفل يدوياً (المدير يفك عن الكاشير)
// ============================================================

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
// سماح فوق مدة عدم النشاط (نفس اللي في lib/auth)
const IDLE_GRACE = 2 * MIN;
const g = globalThis;

export const userKey = (username) =>
  String(username ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 64);

const minutesLeft = (until) =>
  Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / MIN));

const allBranches = (user) => can(user, "allBranches.view");

// ------------------------------------------------------------
// القفل
// ------------------------------------------------------------

// مقفول دلوقتي؟ ← { kind, until, minutes } أو null
export async function checkLoginLocks(username, ip, settings) {
  const keys = [];
  if (settings.maxAttempts > 0)
    keys.push({ kind: "user", key: userKey(username) });
  if (ip && settings.ipMaxAttempts > 0) keys.push({ kind: "ip", key: ip });
  if (!keys.length) return null;

  const rows = await prisma.loginLock.findMany({
    where: { OR: keys, lockedUntil: { gt: new Date() } },
    select: { kind: true, lockedUntil: true },
  });
  if (!rows.length) return null;
  const row =
    rows.find((r) => r.kind === "user") ??
    rows.sort((a, b) => b.lockedUntil - a.lockedUntil)[0];
  return {
    kind: row.kind,
    until: row.lockedUntil,
    minutes: minutesLeft(row.lockedUntil),
  };
}

// محاولة غلط على مفتاح واحد ← { locked, until, remaining }
async function bump(kind, key, max, settings) {
  const now = new Date();
  const windowMs = settings.attemptWindowMinutes * MIN;
  const prev = await prisma.loginLock.findUnique({
    where: { kind_key: { kind, key } },
  });

  // بداية عدّ جديد: أول مرة، أو المدة عدّت، أو قفل قديم خلص
  const fresh =
    !prev ||
    now - prev.windowStart > windowMs ||
    (prev.lockedUntil && prev.lockedUntil <= now);
  // هدوء أكتر من يوم: ننسى مرات القفل القديمة (القفل المتزايد يرجع للأول)
  const stale = prev && now - prev.lastFailAt > DAY;
  const lockCount = !prev || stale ? 0 : prev.lockCount;
  const failures = fresh ? 1 : prev.failures + 1;

  let lockedUntil = null;
  if (failures >= max) {
    lockedUntil = new Date(
      now.getTime() + lockDuration(settings, lockCount) * MIN,
    );
  }
  const data = {
    failures: lockedUntil ? 0 : failures,
    windowStart: fresh || lockedUntil ? now : prev.windowStart,
    lastFailAt: now,
    lockedUntil,
    lockCount: lockedUntil ? lockCount + 1 : lockCount,
  };
  await prisma.loginLock.upsert({
    where: { kind_key: { kind, key } },
    create: { kind, key, ...data },
    update: data,
  });
  return lockedUntil
    ? { locked: true, until: lockedUntil, minutes: minutesLeft(lockedUntil) }
    : { locked: false, remaining: max - failures };
}

// باسورد غلط: نزوّد العداد على الاسم والجهاز
export async function registerLoginFailure(username, ip, settings) {
  let result = { locked: false, remaining: null };
  if (settings.maxAttempts > 0) {
    result = await bump(
      "user",
      userKey(username),
      settings.maxAttempts,
      settings,
    );
  }
  if (ip && settings.ipMaxAttempts > 0) {
    const byIp = await bump("ip", ip, settings.ipMaxAttempts, settings);
    if (byIp.locked && !result.locked) result = byIp;
  }
  return result;
}

// دخول ناجح: عداد الاسم يرجع صفر (الجهاز لأ: عشان محدش يصفّره بحسابه)
export async function clearUserLock(username) {
  await prisma.loginLock.deleteMany({
    where: { kind: "user", key: userKey(username) },
  });
}

// ------------------------------------------------------------
// سجل الدخول
// ------------------------------------------------------------
export async function logLoginAttempt({
  username,
  userId = null,
  success,
  reason,
  ip,
  userAgent,
}) {
  await prisma.loginAttempt
    .create({
      data: {
        username: String(username ?? "").slice(0, 50),
        userId,
        success,
        reason,
        ip,
        userAgent,
      },
    })
    .catch((e) => console.error("[login-log]", e?.message ?? e));
}

// تنظيف دوري (مرة كل ساعة مع أي محاولة دخول): السجل القديم + الجلسات المنتهية + عدادات قديمة
export async function housekeeping(settings) {
  if (g.__erpSecurityCleanAt && Date.now() - g.__erpSecurityCleanAt < 60 * MIN)
    return;
  g.__erpSecurityCleanAt = Date.now();
  const now = Date.now();
  await Promise.all([
    prisma.loginAttempt.deleteMany({
      where: {
        createdAt: { lt: new Date(now - settings.logRetentionDays * DAY) },
      },
    }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }),
    prisma.loginLock.deleteMany({
      where: {
        lastFailAt: { lt: new Date(now - 2 * DAY) },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date(now) } }],
      },
    }),
  ]).catch((e) => console.error("[security] cleanup:", e?.message ?? e));
}

// ------------------------------------------------------------
// حد الأجهزة: قبل فتح جلسة جديدة
// mode oldest: يخرج أقدم جهاز / reject: يرفض الدخول الجديد
// ------------------------------------------------------------
export async function enforceDeviceLimit(user, settings) {
  if (!(settings.maxDevices > 0)) return;
  if (settings.deviceLimitSkipSuper && user.role.isSuper) return;

  const now = Date.now();
  // الجلسات اللي خلصت (مدة أو عدم نشاط) متتحسبش
  const expiredWhere = [{ expiresAt: { lt: new Date(now) } }];
  if (settings.idleMinutes > 0) {
    expiredWhere.push({
      lastSeenAt: {
        lt: new Date(now - settings.idleMinutes * MIN - IDLE_GRACE),
      },
    });
  }
  await prisma.session.deleteMany({
    where: { userId: user.id, OR: expiredWhere },
  });

  const active = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { lastSeenAt: "asc" },
    select: { id: true },
  });
  const extra = active.length - settings.maxDevices + 1;
  if (extra <= 0) return;
  if (settings.deviceLimitMode === "reject") {
    throw new AppError("DeviceLimitReached", { max: settings.maxDevices });
  }
  await prisma.session.deleteMany({
    where: { id: { in: active.slice(0, extra).map((s) => s.id) } },
  });
}

// ------------------------------------------------------------
// الإعدادات
// ------------------------------------------------------------
export async function getSecurity() {
  return getSecuritySettings();
}

export async function saveSecurity(data) {
  const saved = await saveSecuritySettingsRow(data);
  // مدة الجلسة اتقصّرت: الجلسات المفتوحة تخلص على المدة الجديدة
  await prisma.$executeRaw`UPDATE sessions SET expiresAt = LEAST(expiresAt, DATE_ADD(createdAt, INTERVAL ${data.sessionHours} HOUR))`;
  return saved;
}

// ------------------------------------------------------------
// الأجهزة المسجّلة (الجلسات المفتوحة)
// ------------------------------------------------------------
const nameOf = (u) => ({
  id: u.id,
  username: u.username,
  arFullname: u.arFullname,
  enFullname: u.enFullname,
  isSuper: u.role.isSuper,
  role: { arName: u.role.arName, enName: u.role.enName },
});
const userSelect = {
  id: true,
  username: true,
  arFullname: true,
  enFullname: true,
  branchId: true,
  role: { select: { arName: true, enName: true, isSuper: true } },
};

export async function listSessions(actor) {
  const settings = await getSecuritySettings();
  const now = Date.now();
  const where = { expiresAt: { gt: new Date(now) } };
  if (settings.idleMinutes > 0) {
    where.lastSeenAt = {
      gte: new Date(now - settings.idleMinutes * MIN - IDLE_GRACE),
    };
  }
  if (!allBranches(actor)) where.branchId = actor.branch.id;

  const rows = await prisma.session.findMany({
    where,
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      ip: true,
      userAgent: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      user: { select: userSelect },
      branch: { select: { arName: true, enName: true } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    ip: s.ip,
    device: parseUserAgent(s.userAgent),
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
    expiresAt: s.expiresAt,
    current: s.id === actor.sessionId,
    user: nameOf(s.user),
    branch: s.branch,
  }));
}

// مدير غير "مدير النظام" مايقدرش يلمس جلسات أو قفل مدير النظام
const assertCanManage = (actor, target) => {
  if (target?.role?.isSuper && !actor.isSuper) throw new AppError("Forbidden");
};

export async function endSession(id, actor) {
  if (id === actor.sessionId) throw new AppError("CannotEndOwnSession");
  const s = await prisma.session.findUnique({
    where: { id },
    select: { id: true, branchId: true, user: { select: userSelect } },
  });
  if (!s) throw new AppError("SessionNotFound");
  if (!allBranches(actor) && s.branchId !== actor.branch.id)
    throw new AppError("Forbidden");
  assertCanManage(actor, s.user);
  await prisma.session.delete({ where: { id } });
  return { ended: 1 };
}

// كل أجهزة مستخدم (ما عدا الجهاز اللي أنا شغال عليه)
export async function endUserSessions(userId, actor) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: userSelect,
  });
  if (!target) throw new AppError("UserNotFound");
  if (!allBranches(actor) && target.branchId !== actor.branch.id)
    throw new AppError("Forbidden");
  assertCanManage(actor, target);
  const { count } = await prisma.session.deleteMany({
    where: { userId, id: { not: actor.sessionId } },
  });
  return { ended: count };
}

// ------------------------------------------------------------
// سجل الدخول
// result: all | success | failed
// ------------------------------------------------------------
const LOG_LIMIT = 3000;

export async function listLoginLog(
  actor,
  { from, to, result = "all", userId = null },
) {
  const where = { createdAt: { gte: dayStart(from), lte: dayEnd(to) } };
  if (result === "success") where.success = true;
  if (result === "failed") where.success = false;
  if (userId) where.userId = userId;
  // بدون صلاحية كل الفروع: محاولات مستخدمي فرعه بس
  if (!allBranches(actor)) where.user = { branchId: actor.branch.id };

  const [rows, grouped] = await Promise.all([
    prisma.loginAttempt.findMany({
      where,
      orderBy: { id: "desc" },
      take: LOG_LIMIT,
      select: {
        id: true,
        username: true,
        success: true,
        reason: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        user: { select: userSelect },
      },
    }),
    prisma.loginAttempt.groupBy({
      by: ["reason"],
      where,
      _count: { _all: true },
    }),
  ]);
  const byReason = Object.fromEntries(
    grouped.map((r) => [r.reason, r._count._all]),
  );
  const total = grouped.reduce((s, r) => s + r._count._all, 0);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      username: r.username,
      success: r.success,
      reason: r.reason,
      ip: r.ip,
      device: parseUserAgent(r.userAgent),
      createdAt: r.createdAt,
      user: r.user ? nameOf(r.user) : null,
    })),
    total,
    success: byReason.ok ?? 0,
    failed: total - (byReason.ok ?? 0),
    locked: (byReason.locked ?? 0) + (byReason.ipLocked ?? 0),
    truncated: total > LOG_LIMIT,
  };
}

// مستخدمين للفلتر (حسب الفرع)
export async function securityUsers(actor) {
  const users = await prisma.user.findMany({
    where: allBranches(actor)
      ? { isOwner: false }
      : { isOwner: false, branchId: actor.branch.id },
    orderBy: { id: "asc" },
    select: { id: true, username: true, arFullname: true, enFullname: true },
  });
  return users;
}

// ------------------------------------------------------------
// الحسابات والأجهزة المقفولة دلوقتي + فك القفل
// ------------------------------------------------------------
export async function listLocks(actor) {
  const rows = await prisma.loginLock.findMany({
    where: { lockedUntil: { gt: new Date() } },
    orderBy: { lockedUntil: "desc" },
  });
  const names = rows.filter((r) => r.kind === "user").map((r) => r.key);
  const users = names.length
    ? await prisma.user.findMany({
        where: { username: { in: names } },
        select: userSelect,
      })
    : [];
  const byName = new Map(users.map((u) => [userKey(u.username), u]));
  const all = allBranches(actor);

  return (
    rows
      .map((r) => {
        const u = r.kind === "user" ? byName.get(r.key) : null;
        return {
          id: r.id,
          kind: r.kind,
          key: r.key,
          user: u ? nameOf(u) : null,
          branchId: u?.branchId ?? null,
          lockedUntil: r.lockedUntil,
          minutes: minutesLeft(r.lockedUntil),
          lockCount: r.lockCount,
          lastFailAt: r.lastFailAt,
        };
      })
      // قفل حساب مالك البرنامج مش بيظهر لحد غيره
      .filter(
        (r) => actor.isOwner || !(r.kind === "user" && isOwnerUsername(r.key)),
      )
      .filter((r) => all || (r.user && r.branchId === actor.branch.id))
      .map(({ branchId, ...r }) => r)
  );
}

export async function unlockLock(id, actor) {
  const row = await prisma.loginLock.findUnique({ where: { id } });
  if (!row) return { unlocked: 0 }; // اتفك لوحده أو اتمسح
  if (row.kind === "user" && isOwnerUsername(row.key) && !actor.isOwner) {
    throw new AppError("Forbidden");
  }
  if (row.kind === "ip") {
    if (!allBranches(actor)) throw new AppError("Forbidden");
  } else {
    const target = await prisma.user.findFirst({
      where: { username: row.key },
      select: userSelect,
    });
    if (target) {
      if (!allBranches(actor) && target.branchId !== actor.branch.id)
        throw new AppError("Forbidden");
      assertCanManage(actor, target);
    } else if (!allBranches(actor)) {
      throw new AppError("Forbidden");
    }
  }
  await prisma.loginLock.delete({ where: { id } });
  return { unlocked: 1 };
}

// ------------------------------------------------------------
// شاشة المستخدمين: مين مقفول دلوقتي + فك القفل (صلاحية loginSecurity.unlock)
// ------------------------------------------------------------
export async function lockedUsernames(usernames) {
  const keys = usernames.map(userKey);
  if (!keys.length) return new Map();
  const rows = await prisma.loginLock.findMany({
    where: { kind: "user", key: { in: keys }, lockedUntil: { gt: new Date() } },
    select: { key: true, lockedUntil: true },
  });
  return new Map(rows.map((r) => [r.key, r.lockedUntil]));
}

export async function unlockUser(userId, actor) {
  const target = await prisma.user.findFirst({
    where: { id: userId, isOwner: false },
    select: userSelect,
  });
  if (!target) throw new AppError("UserNotFound");
  if (!allBranches(actor) && target.branchId !== actor.branch.id)
    throw new AppError("Forbidden");
  assertCanManage(actor, target);
  const { count } = await prisma.loginLock.deleteMany({
    where: { kind: "user", key: userKey(target.username) },
  });
  return { unlocked: count };
}
