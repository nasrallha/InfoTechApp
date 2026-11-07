// ============================================================
// الأدوار الثابتة: من قاعدتك (DATABASE_URL في .env) ← migration جديدة
//   npm run roles:export
//
// - بيقرا الأدوار العادية وصلاحياتها (من غير مدير النظام ودور المالك)
// - بيكتب prisma/migrations/<الوقت>_fixed_roles/migration.sql
// - أي قاعدة جديدة (إنشاء القاعدة من اللوحة) بتاخد الأدوار دي لوحدها،
//   والشركات الموجودة بتاخدها من "تحديث القواعد" (إنت بتختار الشركات)
// - الدور بيتعرف بـ templateKey = "fixed_<رقمه في قاعدتك>"، فلو عدّلت
//   صلاحياته عندك وعملت export تاني: الـ migration الجديدة بتحدّثه
// - في وضع الشركات الأدوار دي مقفولة عند العميل (يختارها للمستخدمين بس)
// ============================================================
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mariadb from "mariadb";

const url = new URL(process.env.DATABASE_URL);
const conn = await mariadb.createConnection({
  host: url.hostname === "localhost" ? "127.0.0.1" : url.hostname,
  port: Number(url.port) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
  allowPublicKeyRetrieval: true,
});

const q = (v) =>
  v === null || v === undefined
    ? "NULL"
    : `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;

try {
  const roles = await conn.query(
    "SELECT id, arName, enName, isActive FROM `roles` WHERE isSuper = false AND isOwner = false ORDER BY id",
  );
  const perms = await conn.query(
    "SELECT roleId, permission FROM `role_permissions` ORDER BY roleId, permission",
  );
  if (!roles.length) {
    console.log("No roles found (other than System Admin). Nothing to export.");
    process.exit(0);
  }

  const lines = [
    "-- Fixed roles exported from the reference database (npm run roles:export)",
    "-- Each role is identified by templateKey; running it again updates names and permissions",
    "",
  ];
  for (const r of roles) {
    const key = `fixed_${r.id}`;
    const rolePerms = perms.filter((p) => p.roleId === r.id);
    lines.push(`-- ${r.enName}`);
    // جديد ← يتضاف | نفس الاسم موجود (زي قاعدتك نفسها) ← ياخد templateKey
    lines.push(
      `INSERT INTO \`roles\` (arName, enName, isActive, isSuper, isOwner, templateKey, updatedAt) VALUES (${q(r.arName)}, ${q(r.enName)}, ${r.isActive ? "true" : "false"}, false, false, ${q(key)}, CURRENT_TIMESTAMP(3))`,
      `  ON DUPLICATE KEY UPDATE arName = VALUES(arName), enName = VALUES(enName), templateKey = VALUES(templateKey), updatedAt = CURRENT_TIMESTAMP(3);`,
    );
    lines.push(
      `DELETE FROM \`role_permissions\` WHERE roleId = (SELECT id FROM \`roles\` WHERE templateKey = ${q(key)});`,
    );
    if (rolePerms.length) {
      lines.push(
        `INSERT INTO \`role_permissions\` (roleId, permission)`,
        `  SELECT r.id, p.permission FROM \`roles\` r JOIN (`,
        rolePerms
          .map((p, i) => `    SELECT ${q(p.permission)} AS permission${i < rolePerms.length - 1 ? " UNION ALL" : ""}`)
          .join("\n"),
        `  ) p WHERE r.templateKey = ${q(key)};`,
      );
    }
    lines.push("");
  }

  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  // لازم تبقى بعد آخر migration موجودة
  const migDir = path.join(process.cwd(), "prisma", "migrations");
  const last = fs
    .readdirSync(migDir)
    .filter((n) => /^\d{14}_/.test(n))
    .sort()
    .pop();
  const ts = last && last.slice(0, 14) >= stamp
    ? String(BigInt(last.slice(0, 14)) + 1n)
    : stamp;
  const dir = path.join(migDir, `${ts}_fixed_roles`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "migration.sql"), lines.join("\n"), "utf8");

  console.log(`\nExported ${roles.length} roles (${perms.filter((p) => roles.some((r) => r.id === p.roleId)).length} permissions)`);
  console.log(`Migration: prisma/migrations/${ts}_fixed_roles/migration.sql`);
  console.log("Next: npm run db:deploy (this database), then update company databases from the control panel.\n");
} finally {
  await conn.end();
}
