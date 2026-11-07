import "server-only";
import fs from "fs";
import fsp from "fs/promises";
import { constants as fsConstants } from "fs";
import path from "path";
import os from "os";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { currentDbConfig } from "@/lib/db-config";
import { currentCompanyCode, multiTenant } from "@/lib/tenant";
import { clearCached, hasFlag, setFlag } from "@/lib/tenant-state";
import { dumpDatabase } from "@/lib/db-backup";
import { executeBackup, inspectBackup } from "@/lib/db-restore";
import { spawn } from "child_process";
import {
  AUTO_PREFIX,
  SAFETY_PREFIX,
  UPLOAD_PREFIX,
  backupKind,
  isAutoBackup,
  nextBackupAt,
} from "@/lib/backup-schedule";

// ============================================================
// النسخ الاحتياطي لقاعدة البيانات
// - الملفات بتتحفظ على السيرفر (الجهاز اللي شغال عليه البرنامج) في مجلد بنختاره
//   (الافتراضي: مجلد backups جوه المشروع)
// - من الشاشة: عمل نسخة، تنزيلها على جهازك، حذفها، تغيير مجلد الحفظ
// ============================================================

export const DEFAULT_BACKUP_DIR = path.join(process.cwd(), "backups");
const FILE_RE = /^[\w.-]+\.sql$/;

// نسخة واحدة في نفس الوقت
const g = globalThis;

async function savedDir() {
  const s = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { backupDir: true },
  });
  return s?.backupDir || null;
}

// المجلد الأساسي (اللي اتختار من الشاشة، أو الافتراضي)
async function baseBackupDir() {
  return (await savedDir()) || DEFAULT_BACKUP_DIR;
}

// وضع الشركات: كل شركة في فولدر باسم كودها جوه المجلد ده
// (نسخ شركة متظهرش ولا تتلمس من شركة تانية)
export async function getBackupDir() {
  const base = await baseBackupDir();
  if (!multiTenant()) return base;
  const code = await currentCompanyCode();
  if (!code) throw new AppError("NoCompany");
  return path.join(base, code);
}

// الملف داخل مجلد النسخ بس (حماية من ../)
export async function backupFilePath(name) {
  if (!FILE_RE.test(name ?? "") || path.basename(name) !== name) {
    throw new AppError("BackupNotFound");
  }
  return path.join(await getBackupDir(), name);
}

export async function listBackups() {
  const dir = await getBackupDir();
  let names = [];
  try {
    names = (await fsp.readdir(dir)).filter((n) => FILE_RE.test(n));
  } catch {
    names = []; // المجلد لسه متعملش
  }
  const files = await Promise.all(
    names.map(async (name) => {
      try {
        const st = await fsp.stat(path.join(dir, name));
        return st.isFile()
          ? {
              name,
              size: st.size,
              createdAt: st.mtime.toISOString(),
              auto: isAutoBackup(name),
              kind: backupKind(name),
            }
          : null;
      } catch {
        return null;
      }
    }),
  );
  return {
    dir,
    database: (await currentDbConfig()).database,
    isDefault: (await baseBackupDir()) === DEFAULT_BACKUP_DIR,
    defaultDir: DEFAULT_BACKUP_DIR,
    running: await hasFlag("backupRunning"),
    schedule: await getBackupSchedule(),
    files: files
      .filter(Boolean)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
};

async function ensureWritable(dir) {
  try {
    await fsp.mkdir(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${process.pid}`);
    await fsp.writeFile(probe, "ok");
    await fsp.unlink(probe);
  } catch {
    throw new AppError("BackupDirNotWritable", { dir });
  }
}

// auto: النسخ التلقائي (الملف بيبدأ بـ auto_ عشان يتعرف ويتمسح القديم منه لوحده)
export async function createBackup(user, { auto = false, prefix = null } = {}) {
  if (await hasFlag("backupRunning")) throw new AppError("BackupRunning");
  await setFlag("backupRunning", true);
  try {
    const dir = await getBackupDir();
    await ensureWritable(dir);
    const db = (await currentDbConfig()).database.replace(/[^\w-]/g, "_");
    const name = `${prefix ?? (auto ? AUTO_PREFIX : "")}backup_${db}_${stamp()}.sql`;
    const started = Date.now();
    const { tables, rows } = await dumpDatabase(path.join(dir, name));
    const st = await fsp.stat(path.join(dir, name));
    console.info(
      `[backup] ${name} (${tables} tables, ${rows} rows, ${st.size} bytes) ${auto ? "(auto)" : `by user #${user?.id}`}`,
    );
    return {
      name,
      size: st.size,
      tables,
      rows,
      seconds: Math.round((Date.now() - started) / 100) / 10,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("[backup] failed:", error?.message ?? error);
    throw new AppError("BackupFailed", { message: error?.message ?? null });
  } finally {
    await setFlag("backupRunning", false);
  }
}

export async function deleteBackup(name) {
  const file = await backupFilePath(name);
  try {
    await fsp.unlink(file);
  } catch {
    throw new AppError("BackupNotFound");
  }
}

// dir فاضي = الرجوع للمجلد الافتراضي
export async function saveBackupDir(dir) {
  const value = dir?.trim() ? path.normalize(dir.trim()) : null;
  if (value) {
    if (!path.isAbsolute(value)) throw new AppError("BackupDirNotAbsolute");
    await ensureWritable(value);
  }
  await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, backupDir: value },
    update: { backupDir: value },
  });
  return listBackups();
}

// ------------------------------------------------------------
// تصفح المجلدات على السيرفر (لاختيار مجلد الحفظ من الشاشة بدل الكتابة)
// - مفيش مسار: أول مستوى (البارتشنات C: D: ... على ويندوز، أو / على لينكس)
// - بيرجع المجلدات بس (من غير ملفات)، ومن غير مجلدات النظام المخفية
// ------------------------------------------------------------
const isWindows = process.platform === "win32";
const HIDDEN = new Set([
  "$recycle.bin",
  "system volume information",
  "$windows.~bt",
  "$windows.~ws",
  "config.msi",
  "recovery",
  "proc",
  "sys",
  "dev",
]);

async function roots() {
  if (!isWindows) return [{ name: "/", path: "/" }];
  const letters = "CDEFGHIJKLMNOPQRSTUVWXYZAB".split("");
  const found = await Promise.all(
    letters.map(async (l) => {
      const p = `${l}:\\`;
      try {
        await fsp.access(p);
        return { name: `${l}:`, path: p };
      } catch {
        return null;
      }
    }),
  );
  return found.filter(Boolean);
}

// C:\\x و c:\\x نفس المجلد: الحرف دايماً كابيتال عشان الشجرة تتطابق
function normalizeDir(dir) {
  const p = path.resolve(dir);
  return isWindows ? p.replace(/^[a-z]:/, (m) => m.toUpperCase()) : p;
}

async function exists(dir) {
  try {
    return (await fsp.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function isWritable(dir) {
  try {
    await fsp.access(dir, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function browseFolders(dir) {
  const raw = dir?.trim();
  if (!raw) {
    return {
      path: null,
      parent: null,
      folders: await roots(),
      writable: false,
    };
  }
  // المجلد لسه متعملش (زي مجلد الحفظ الافتراضي قبل أول نسخة): نفتح أقرب مجلد موجود فوقه
  let current = normalizeDir(raw);
  while (!(await exists(current))) {
    const up = path.dirname(current);
    if (up === current) break;
    current = up;
  }
  let entries;
  try {
    entries = await fsp.readdir(current, { withFileTypes: true });
  } catch {
    throw new AppError("FolderNotReadable", { dir: current });
  }
  const folders = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .filter((e) => !HIDDEN.has(e.name.toLowerCase()))
    .map((e) => ({ name: e.name, path: path.join(current, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const up = path.dirname(current);
  return {
    path: current,
    // أول البارتشن (C:\\ أو /): الرجوع يفتح قايمة البارتشنات
    parent: up === current ? (isWindows ? "" : null) : up,
    folders,
    writable: await isWritable(current),
  };
}

// مجلد جديد جوه المجلد المفتوح
const FOLDER_NAME = /^[^<>:"/\\|?*\x00-\x1f]{1,100}$/;
export async function createFolder(parent, name) {
  const clean = name?.trim();
  if (
    !parent ||
    !clean ||
    !FOLDER_NAME.test(clean) ||
    clean === "." ||
    clean === ".."
  ) {
    throw new AppError("FolderNameInvalid");
  }
  const target = path.join(path.resolve(parent), clean);
  try {
    await fsp.mkdir(target);
  } catch (e) {
    if (e?.code === "EEXIST") throw new AppError("FolderExists");
    throw new AppError("BackupDirNotWritable", { dir: parent });
  }
  return browseFolders(target);
}

// ------------------------------------------------------------
// الشجرة: فتح مسار معيّن مرة واحدة (البارتشن ← ... ← المجلد)
// بيرجع مجلدات كل مستوى في الطريق عشان الشجرة تتفتح عليه على طول
// ------------------------------------------------------------
function chainOf(dir) {
  const out = [];
  let p = dir;
  for (;;) {
    out.unshift(p);
    const up = path.dirname(p);
    if (up === p) break;
    p = up;
  }
  return out;
}

export async function revealFolder(dir) {
  const target = await browseFolders(dir); // بيصلّح المسار لأقرب مجلد موجود
  if (!target.path) return { path: null, writable: false, chain: [] };
  const levels = chainOf(target.path).slice(0, -1);
  const chain = [];
  for (const p of levels) {
    try {
      const v = await browseFolders(p);
      chain.push({ path: v.path, folders: v.folders });
    } catch {
      break; // مستوى مقفول (صلاحيات): نكتفي باللي قبله
    }
  }
  chain.push({ path: target.path, folders: target.folders });
  return { path: target.path, writable: target.writable, chain };
}

// البداية: البارتشنات + اختصارات (سطح المكتب، المستندات، التنزيلات، مجلد البرنامج)
export async function folderTreeStart() {
  const home = os.homedir();
  const candidates = [
    { key: "current", path: await getBackupDir() },
    { key: "desktop", path: path.join(home, "Desktop") },
    { key: "desktop", path: path.join(home, "OneDrive", "Desktop") },
    { key: "documents", path: path.join(home, "Documents") },
    { key: "documents", path: path.join(home, "OneDrive", "Documents") },
    { key: "downloads", path: path.join(home, "Downloads") },
    { key: "home", path: home },
    { key: "program", path: process.cwd() },
  ];
  const seen = new Set();
  const shortcuts = [];
  for (const c of candidates) {
    if (seen.has(c.key)) continue;
    const p = normalizeDir(c.path);
    // مجلد الحفظ الحالي يظهر حتى لو لسه متعملش (بيفتح أقرب مجلد فوقه)
    if (c.key !== "current" && !(await exists(p))) continue;
    seen.add(c.key);
    shortcuts.push({ key: c.key, path: p });
  }
  return { roots: await roots(), shortcuts };
}

// ------------------------------------------------------------
// النسخ الاحتياطي التلقائي (المواعيد في lib/backup-schedule، والتشغيل في lib/backup-scheduler)
// ------------------------------------------------------------
export const scheduleSelect = {
  backupAutoEnabled: true,
  backupFrequency: true,
  backupEveryHours: true,
  backupTime: true,
  backupWeekday: true,
  backupKeep: true,
  backupAutoSince: true,
  lastAutoBackupAt: true,
  lastAutoBackupOk: true,
  lastAutoBackupError: true,
  lastAutoBackupFile: true,
};

const DEFAULT_SCHEDULE = {
  backupAutoEnabled: false,
  backupFrequency: "daily",
  backupEveryHours: 12,
  backupTime: "03:00",
  backupWeekday: 5,
  backupKeep: 14,
  backupAutoSince: null,
  lastAutoBackupAt: null,
  lastAutoBackupOk: null,
  lastAutoBackupError: null,
  lastAutoBackupFile: null,
};

export async function getBackupSchedule() {
  const s =
    (await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: scheduleSelect,
    })) ?? DEFAULT_SCHEDULE;
  return { ...s, nextAt: nextBackupAt(s) };
}

export async function saveBackupSchedule(data) {
  const current = await getBackupSchedule();
  const values = {
    backupAutoEnabled: data.backupAutoEnabled,
    backupFrequency: data.backupFrequency,
    backupEveryHours: data.backupEveryHours,
    backupTime: data.backupTime,
    backupWeekday: data.backupWeekday,
    backupKeep: data.backupKeep,
    // من دلوقتي: الميعاد الجاي بيتحسب من وقت الحفظ (مايعملش نسخة عن ميعاد فات قبل التشغيل)
    ...(data.backupAutoEnabled ? { backupAutoSince: new Date() } : {}),
  };
  if (!current.backupAutoEnabled && data.backupAutoEnabled) {
    values.lastAutoBackupError = null;
    values.lastAutoBackupOk = null;
  }
  await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, ...values },
    update: values,
  });
  return listBackups();
}

// الأقدم من عدد النسخ المحدد يتمسح (التلقائية بس، اليدوية متتلمسش)
async function pruneAutoBackups(keep) {
  if (!(keep > 0)) return 0;
  const dir = await getBackupDir();
  let names = [];
  try {
    names = (await fsp.readdir(dir)).filter(
      (n) => FILE_RE.test(n) && isAutoBackup(n),
    );
  } catch {
    return 0;
  }
  const withTime = await Promise.all(
    names.map(async (name) => {
      try {
        return { name, t: (await fsp.stat(path.join(dir, name))).mtimeMs };
      } catch {
        return null;
      }
    }),
  );
  const old = withTime
    .filter(Boolean)
    .sort((a, b) => b.t - a.t)
    .slice(keep);
  for (const f of old) {
    await fsp.unlink(path.join(dir, f.name)).catch(() => {});
  }
  if (old.length)
    console.info(`[backup] auto: removed ${old.length} old file(s)`);
  return old.length;
}

// نسخة تلقائية واحدة (من الـ scheduler)
// بترجع: "done" | "busy" (فيه نسخة شغالة) | "failed"
export async function runAutoBackup() {
  const s = await getBackupSchedule();
  try {
    const r = await createBackup(null, { auto: true });
    await prisma.systemSettings.update({
      where: { id: 1 },
      data: {
        lastAutoBackupAt: new Date(),
        lastAutoBackupOk: true,
        lastAutoBackupError: null,
        lastAutoBackupFile: r.name,
      },
    });
    await pruneAutoBackups(s.backupKeep);
    return "done";
  } catch (error) {
    if (error instanceof AppError && error.code === "BackupRunning")
      return "busy";
    const reason =
      error instanceof AppError
        ? error.code === "BackupDirNotWritable"
          ? `BackupDirNotWritable: ${error.details?.dir ?? ""}`
          : `${error.code}: ${error.details?.message ?? ""}`
        : String(error?.message ?? error);
    await prisma.systemSettings
      .update({
        where: { id: 1 },
        data: {
          lastAutoBackupOk: false,
          lastAutoBackupError: reason.slice(0, 500),
        },
      })
      .catch(() => {});
    console.error("[backup] auto failed:", reason);
    return "failed";
  }
}

// ------------------------------------------------------------
// رفع ملف نسخة من جهازك (للاسترجاع) - من /api/backups/upload
// ------------------------------------------------------------
export async function uploadedBackupPath(originalName) {
  const dir = await getBackupDir();
  await ensureWritable(dir);
  const base = String(originalName || "file")
    .replace(/\.sql$/i, "")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 60);
  return path.join(dir, `${UPLOAD_PREFIX}${stamp()}_${base}.sql`);
}

// ------------------------------------------------------------
// الاسترجاع (مالك البرنامج) - للمشاكل الكبيرة بس
// 1) نسخة أمان تلقائية من الوضع الحالي (before_restore_...) عشان ترجع لو حصلت مشكلة
// 2) نحفظ سلسلة الزكاة الحالية (ICV والـ Hash لكل فرع)
// 3) تنفيذ الملف (الجداول بتتمسح وترجع زي ما كانت وقت النسخة)
// 4) لو النسخة أقدم من البرنامج: الـ migrations الناقصة بتتعمل تلقائياً
// 5) سلسلة الزكاة: لو الرقم رجع لورا بنكمّله من آخر رقم (عشان الأرقام متتكررش عند الهيئة)
// 6) كل المستخدمين بيخرجوا (الجلسات بتتمسح)
// لو التنفيذ فشل في النص: بنرجّع نسخة الأمان تلقائياً
// ------------------------------------------------------------
const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

async function codeMigrations() {
  try {
    return (await fsp.readdir(MIGRATIONS_DIR, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

// prisma migrate deploy (نفس npm run db:deploy) - للنسخ الأقدم من البرنامج
function runMigrateDeploy() {
  return new Promise((resolve) => {
    const cli = path.join(
      process.cwd(),
      "node_modules",
      "prisma",
      "build",
      "index.js",
    );
    if (!fs.existsSync(cli))
      return resolve({ ok: false, output: "prisma CLI not found" });
    const child = spawn(process.execPath, [cli, "migrate", "deploy"], {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    const timer = setTimeout(() => child.kill(), 5 * 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: output.slice(-2000) });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, output: String(e?.message ?? e) });
    });
  });
}

async function zatcaChains() {
  try {
    return await prisma.zatcaUnit.findMany({
      select: {
        branchId: true,
        certSerial: true,
        icv: true,
        lastHash: true,
        environment: true,
      },
    });
  } catch {
    return [];
  }
}

export const isRestoring = () => hasFlag("restoring");

export async function restoreBackup(name, user) {
  if ((await hasFlag("restoring")) || (await hasFlag("backupRunning")))
    throw new AppError("BackupRunning");
  const file = await backupFilePath(name);
  try {
    await fsp.access(file);
  } catch {
    throw new AppError("BackupNotFound");
  }

  // الملف من البرنامج؟ وهل هو أحدث من نسخة البرنامج دي؟
  const info = await inspectBackup(file);
  if (!info.valid || !info.tables.length)
    throw new AppError("BackupFormatUnknown");
  const known = new Set(await codeMigrations());
  const newer = info.migrations.filter((m) => !known.has(m));
  if (newer.length)
    throw new AppError("BackupNewerThanProgram", { count: newer.length });
  const missing = [...known].filter((m) => !info.migrations.includes(m));

  const chainsBefore = await zatcaChains();

  // 1) نسخة أمان
  const safety = await createBackup(user, { prefix: SAFETY_PREFIX });

  await setFlag("restoring", true);
  const started = Date.now();
  try {
    try {
      await executeBackup(file, info);
    } catch (error) {
      console.error("[restore] failed, rolling back:", error?.message ?? error);
      // رجوع للوضع قبل الاسترجاع
      try {
        const safetyFile = await backupFilePath(safety.name);
        await executeBackup(safetyFile, await inspectBackup(safetyFile));
      } catch (e2) {
        console.error("[restore] ROLLBACK FAILED:", e2?.message ?? e2);
        throw new AppError("RestoreRollbackFailed", { safety: safety.name });
      }
      throw new AppError("RestoreFailed", { message: error?.message ?? null });
    }

    // 4) migrations الناقصة
    let migrate = null;
    if (missing.length) {
      migrate = await runMigrateDeploy();
      if (!migrate.ok)
        console.error("[restore] migrate deploy failed:", migrate.output);
    }

    // 5) سلسلة الزكاة: منرجعش لورا (نفس الشهادة = نفس الفرع ونفس السيريال)
    let zatcaGap = 0;
    const after = await zatcaChains();
    for (const b of chainsBefore) {
      const a = after.find(
        (x) =>
          x.branchId === b.branchId &&
          x.certSerial &&
          x.certSerial === b.certSerial,
      );
      if (a && a.icv < b.icv) {
        if (b.environment === "production") zatcaGap += b.icv - a.icv;
        await prisma.zatcaUnit.updateMany({
          where: { branchId: b.branchId },
          data: { icv: b.icv, lastHash: b.lastHash },
        });
      }
    }

    // 6) كل المستخدمين يخرجوا + الإعدادات المحفوظة في الذاكرة تتقري من جديد
    await prisma.session.deleteMany({}).catch(() => {});
    await clearCached("security");
    try {
      const { syncAppLocale } = await import("./system-settings.service");
      await syncAppLocale();
    } catch {
      // مش مهم
    }

    console.info(
      `[restore] ${name} restored by user #${user?.id} in ${Math.round((Date.now() - started) / 1000)}s (safety: ${safety.name})`,
    );
    return {
      name,
      safety: safety.name,
      migrated: missing.length,
      migrateOk: migrate ? migrate.ok : true,
      zatcaGap,
    };
  } finally {
    await setFlag("restoring", false);
  }
}
