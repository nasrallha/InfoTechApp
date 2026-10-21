"use server";

// الإعدادات ← الدخول والأمان: الإعدادات، الأجهزة المسجّلة، سجل الدخول، القفل

import { runAction } from "@/lib/action";
import { touchSession } from "@/lib/auth";
import { idField } from "@/validations/common.schema";
import {
  loginLogSchema,
  securitySettingsSchema,
} from "@/validations/login-security.schema";
import {
  endSession,
  endUserSessions,
  listLocks,
  listLoginLog,
  listSessions,
  saveSecurity,
  unlockLock,
} from "@/services/login-security.service";

export async function saveSecuritySettingsAction(input) {
  return runAction(securitySettingsSchema, input, (d) => saveSecurity(d), {
    permission: "loginSecurity.update",
  });
}

export async function listSessionsAction() {
  return runAction(null, null, (_, user) => listSessions(user), {
    permission: "loginSecurity.sessions",
  });
}

export async function endSessionAction(id) {
  return runAction(idField, id, (d, user) => endSession(d, user), {
    permission: "loginSecurity.endSessions",
  });
}

export async function endUserSessionsAction(userId) {
  return runAction(idField, userId, (d, user) => endUserSessions(d, user), {
    permission: "loginSecurity.endSessions",
  });
}

export async function listLoginLogAction(input) {
  return runAction(loginLogSchema, input, (d, user) => listLoginLog(user, d), {
    permission: "loginSecurity.log",
  });
}

export async function listLocksAction() {
  return runAction(null, null, (_, user) => listLocks(user), {
    permission: "loginSecurity.unlock",
  });
}

export async function unlockAction(id) {
  return runAction(idField, id, (d, user) => unlockLock(d, user), {
    permission: "loginSecurity.unlock",
  });
}

// آخر نشاط (من الواجهة كل دقيقة لو المستخدم شغال) - لأي مستخدم مسجل
export async function touchSessionAction() {
  return runAction(null, null, async (_, user) => {
    await touchSession(user.sessionId);
    return { ok: true };
  });
}
