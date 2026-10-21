import "server-only";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/password";

// ============================================================
// مالك البرنامج (صاحب البرنامج / الدعم الفني)
// - الحساب متعرّف في ملف الإعدادات على السيرفر (.env)، مش في قاعدة البيانات:
//     OWNER_USERNAME=...
//     OWNER_PASSWORD=scrypt:...   (بيتعمل بأمر: npm run owner:set)
//     OWNER_NAME_AR=... / OWNER_NAME_EN=...   (اختياري: الاسم اللي بيظهر على الفواتير)
//   فمحدش من جوه البرنامج يقدر يشوفه أو يعدّله، وبيفضل شغال بعد التصفير أو الاسترجاع
// - بعد الدخول بيتعمل له صف مخفي في جدول المستخدمين (isOwner) عشان المستندات
//   اللي بيعملها تتسجل باسمه. الصف ده مش بيظهر في المستخدمين ولا الأدوار ولا التقارير
// - لو المتغيرات دي مش موجودة: مفيش مالك، وصلاحيات المالك بترجع عادية زي الأول
// ============================================================

// اسم المستخدم المخفي في الجدول (مينفعش حد يدخل بيه، الباسورد عشوائي)
export const OWNER_DB_USERNAME = "__owner__";

const env = () => ({
  username: process.env.OWNER_USERNAME?.trim() || "",
  // scrypt:salt:hash (بـ : بدل $ عشان ملف .env مايفهمش $ كمتغير)
  password: process.env.OWNER_PASSWORD?.trim() || "",
  arName: process.env.OWNER_NAME_AR?.trim() || "مالك البرنامج",
  enName: process.env.OWNER_NAME_EN?.trim() || "Program Owner",
});

export function ownerEnabled() {
  const o = env();
  return Boolean(o.username && o.password.startsWith("scrypt:"));
}

export function isOwnerUsername(username) {
  const o = env();
  const u = String(username ?? "")
    .trim()
    .toLowerCase();
  return (
    u === OWNER_DB_USERNAME ||
    (ownerEnabled() && u === o.username.toLowerCase())
  );
}

export async function verifyOwnerPassword(password) {
  if (!ownerEnabled()) return false;
  const stored = env()
    .password.replace(/^scrypt:/, "scrypt$")
    .replace(/:/, "$");
  return verifyPassword(password, stored);
}

// الدور المخفي (مدير نظام + مالك)
async function ownerRole(tx) {
  const found = await tx.role.findFirst({
    where: { isOwner: true },
    select: { id: true },
  });
  if (found) return found.id;
  const role = await tx.role.create({
    data: {
      arName: "مالك البرنامج (مخفي)",
      enName: "Program Owner (hidden)",
      isSuper: true,
      isOwner: true,
      isActive: true,
    },
    select: { id: true },
  });
  return role.id;
}

// صف المالك في جدول المستخدمين (بيتعمل أو يتحدّث مع كل دخول)
export async function ensureOwnerUser() {
  const o = env();
  return prisma.$transaction(async (tx) => {
    const roleId = await ownerRole(tx);
    const existing = await tx.user.findFirst({
      where: { isOwner: true },
      select: {
        id: true,
        branchId: true,
        branch: { select: { isActive: true } },
      },
    });
    // الفرع: فرعه لو لسه شغال، وإلا أول فرع نشط
    let branchId = existing?.branch?.isActive ? existing.branchId : null;
    if (!branchId) {
      const first = await tx.branch.findFirst({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      if (!first) throw new AppError("BranchInactive");
      branchId = first.id;
    }
    const data = {
      arFullname: o.arName,
      enFullname: o.enName,
      isActive: true,
      roleId,
      branchId,
    };
    if (existing) {
      await tx.user.update({ where: { id: existing.id }, data });
      return { id: existing.id, branchId };
    }
    const created = await tx.user.create({
      data: {
        ...data,
        username: OWNER_DB_USERNAME,
        isOwner: true,
        // باسورد عشوائي: الدخول بيكون بالحساب اللي في ملف الإعدادات بس
        password: await hashPassword(randomBytes(32).toString("hex")),
      },
      select: { id: true },
    });
    return { id: created.id, branchId };
  });
}

// ------------------------------------------------------------
// شاشة "حساب المالك": تعديل الاسم واسم الدخول والباسورد من البرنامج
// بيكتب سطور OWNER_ في ملف .env (نفس npm run owner:set) وبيطبّق على طول
// ------------------------------------------------------------
const ENV_FILE = path.join(process.cwd(), ".env");
const OWNER_KEYS = [
  "OWNER_USERNAME",
  "OWNER_PASSWORD",
  "OWNER_NAME_AR",
  "OWNER_NAME_EN",
];

export function getOwnerProfile() {
  const o = env();
  return { username: o.username, arName: o.arName, enName: o.enName };
}

// password: الباسورد الجديد (نص) أو null = زي ما هو
export async function saveOwnerAccount({ username, password, arName, enName }) {
  const o = env();
  let hashed = o.password;
  if (password) {
    // نفس lib/password بس بـ : بدل $ (ملف .env بيعتبر $ متغير)
    hashed = (await hashPassword(password)).replace(/\$/g, ":");
  }
  const values = {
    OWNER_USERNAME: username,
    OWNER_PASSWORD: hashed,
    OWNER_NAME_AR: arName,
    OWNER_NAME_EN: enName,
  };

  let old = "";
  try {
    old = fs.readFileSync(ENV_FILE, "utf8");
  } catch {
    old = "";
  }
  const kept = old
    .split(/\r?\n/)
    .filter(
      (line) =>
        !OWNER_KEYS.some((k) => new RegExp(`^\\s*${k}\\s*=`).test(line)) &&
        !/^#\s*(Program owner account|حساب مالك البرنامج)/.test(line),
    );
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  const block = [
    "",
    "# Program owner account (npm run owner:set)",
    ...Object.entries(values).map(([k, v]) => `${k}="${v}"`),
    "",
  ];
  try {
    fs.writeFileSync(ENV_FILE, [...kept, ...block].join("\n"), "utf8");
  } catch {
    throw new AppError("OwnerEnvNotWritable");
  }
  // يطبّق على طول من غير إعادة تشغيل
  for (const [k, v] of Object.entries(values)) process.env[k] = v;

  // الاسم اللي بيظهر على المستندات (صف المالك المخفي)
  await prisma.user.updateMany({
    where: { isOwner: true },
    data: { arFullname: arName, enFullname: enName },
  });
  return getOwnerProfile();
}
