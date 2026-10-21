import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import {
  OWNER_DB_USERNAME,
  getOwnerProfile,
  ownerEnabled,
  saveOwnerAccount,
  verifyOwnerPassword,
} from "@/lib/owner";
import { clearUserLock } from "./login-security.service";

// ============================================================
// الإعدادات ← حساب المالك (لمالك البرنامج بس)
// تعديل الاسم واسم الدخول والباسورد (لازم الباسورد الحالي)
// ============================================================

const assertOwner = (user) => {
  if (!user?.isOwner || !ownerEnabled()) throw new AppError("Forbidden");
};

export function ownerProfile(user) {
  assertOwner(user);
  return getOwnerProfile();
}

export async function updateOwnerProfile(data, user) {
  assertOwner(user);
  if (!(await verifyOwnerPassword(data.currentPassword))) {
    throw new AppError("WrongCurrentPassword", null, {
      currentPassword: "WrongCurrentPassword",
    });
  }
  const current = getOwnerProfile();
  const username = data.username.trim();
  if (username.toLowerCase() !== current.username.toLowerCase()) {
    // اسم مستخدم عادي موجود بنفس الاسم
    const taken = await prisma.user.findFirst({
      where: { username, isOwner: false },
      select: { id: true },
    });
    if (taken || username === OWNER_DB_USERNAME) {
      throw new AppError("UsernameExists", null, {
        username: "UsernameExists",
      });
    }
  }
  const saved = await saveOwnerAccount({
    username,
    password: data.newPassword || null,
    arName: data.arName.trim(),
    enName: data.enName.trim(),
  });
  await clearUserLock(current.username).catch(() => {});
  return saved;
}
