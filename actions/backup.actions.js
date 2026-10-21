"use server";

// النسخ الاحتياطي لقاعدة البيانات (الإدارة)

import { z } from "zod";
import { runAction } from "@/lib/action";
import {
  BACKUP_EVERY_HOURS,
  BACKUP_FREQUENCIES,
  BACKUP_KEEP,
  BACKUP_TIMES,
} from "@/lib/backup-schedule";
import {
  createBackup,
  deleteBackup,
  listBackups,
  saveBackupDir,
  browseFolders,
  createFolder,
  folderTreeStart,
  revealFolder,
  saveBackupSchedule,
  restoreBackup,
} from "@/services/backup.service";

const nameSchema = z.object({ name: z.string().min(1).max(200) });
const dirSchema = z.object({ dir: z.string().max(500).default("") });
const newFolderSchema = z.object({
  parent: z.string().min(1).max(500),
  name: z.string().min(1).max(100),
});

export async function listBackupsAction() {
  return runAction(null, null, () => listBackups(), {
    permission: "backups.view",
  });
}

export async function createBackupAction() {
  return runAction(null, null, (_, user) => createBackup(user), {
    permission: "backups.create",
  });
}

export async function deleteBackupAction(input) {
  return runAction(nameSchema, input, (d) => deleteBackup(d.name), {
    permission: "backups.delete",
  });
}

export async function saveBackupDirAction(input) {
  return runAction(dirSchema, input, (d) => saveBackupDir(d.dir), {
    permission: "backups.settings",
  });
}

// تصفح مجلدات السيرفر لاختيار مجلد الحفظ
export async function browseFoldersAction(input) {
  return runAction(dirSchema, input, (d) => browseFolders(d.dir), {
    permission: "backups.settings",
  });
}

export async function createFolderAction(input) {
  return runAction(
    newFolderSchema,
    input,
    (d) => createFolder(d.parent, d.name),
    { permission: "backups.settings" },
  );
}

// الشجرة: البارتشنات + الاختصارات
export async function folderTreeStartAction() {
  return runAction(null, null, () => folderTreeStart(), {
    permission: "backups.settings",
  });
}

// فتح الشجرة على مسار معيّن (اختصار أو مسار مكتوب)
export async function revealFolderAction(input) {
  return runAction(dirSchema, input, (d) => revealFolder(d.dir), {
    permission: "backups.settings",
  });
}

// النسخ التلقائي: المواعيد وعدد النسخ اللي تتساب (مالك البرنامج)
const oneOf = (list) =>
  z
    .number()
    .int()
    .refine((v) => list.includes(v), "ValidationError");
const scheduleSchema = z.object({
  backupAutoEnabled: z.boolean(),
  backupFrequency: z.enum(BACKUP_FREQUENCIES),
  backupEveryHours: oneOf(BACKUP_EVERY_HOURS),
  backupTime: z.enum(BACKUP_TIMES),
  backupWeekday: z.number().int().min(0).max(6),
  backupKeep: oneOf(BACKUP_KEEP),
});

export async function saveBackupScheduleAction(input) {
  return runAction(scheduleSchema, input, (d) => saveBackupSchedule(d), {
    permission: "backups.settings",
  });
}

// استرجاع نسخة (مالك البرنامج) - لازم يكتب كلمة التأكيد
const restoreSchema = z.object({
  name: z.string().min(1).max(200),
  confirm: z.enum(["استرجاع", "RESTORE"]),
});

export async function restoreBackupAction(input) {
  return runAction(
    restoreSchema,
    input,
    (d, user) => restoreBackup(d.name, user),
    {
      permission: "backups.restore",
    },
  );
}
